use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, SecondsFormat, Utc};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use parking_lot::Mutex;
use serde::Deserialize;
use thiserror::Error;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::task::JoinHandle;
use tokio::time::sleep;

const RESERVED_KEYS: &[&str] = &["ts", "btC", "etC", "powerPct", "fanPct", "drumRpm"];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TcpLineDriverConfig {
  host: String,
  port: u16,
  format: FrameFormat,
  csv: CsvConfig,
  emit_interval_ms: u64,
  dedupe_within_ms: u64,
  offsets: Offsets,
  reconnect: ReconnectConfig,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
enum FrameFormat {
  #[serde(rename = "jsonl")]
  Jsonl,
  #[serde(rename = "csv")]
  Csv,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CsvConfig {
  has_header: bool,
  columns: Vec<String>,
  delimiter: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Offsets {
  bt_c: f64,
  et_c: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReconnectConfig {
  enabled: bool,
  min_backoff_ms: u64,
  max_backoff_ms: u64,
}

#[derive(Debug, Clone)]
struct Backoff {
  current: u64,
  min: u64,
  max: u64,
}

impl Backoff {
  fn new(min: u64, max: u64) -> Self {
    Self { current: min, min, max }
  }

  fn next(&mut self) -> u64 {
    let value = self.current;
    self.current = self.current.saturating_mul(2).clamp(self.min, self.max);
    value
  }

  fn reset(&mut self) {
    self.current = self.min;
  }
}

#[derive(Debug, Clone)]
struct RawTelemetrySample {
  ts: DateTime<Utc>,
  bt_c: Option<f64>,
  et_c: Option<f64>,
  power_pct: Option<f64>,
  fan_pct: Option<f64>,
  drum_rpm: Option<f64>,
  extras: Option<Vec<ExtraEntry>>,
}

#[derive(Debug, Clone, Copy)]
#[napi(string_enum)]
enum DriverState {
  DISCONNECTED,
  CONNECTING,
  CONNECTED,
  STOPPED,
}

#[derive(Debug, Clone, Default)]
#[napi(object)]
struct DriverMetrics {
  pub linesReceived: u64,
  pub linesParsed: u64,
  pub parseErrors: u64,
  pub telemetryEmitted: u64,
  pub reconnects: u64,
  pub lastError: Option<String>,
  pub lastLineAt: Option<String>,
}

#[derive(Debug, Clone)]
#[napi(object)]
struct DriverStatus {
  pub state: DriverState,
  pub metrics: DriverMetrics,
}

#[derive(Debug, Clone)]
#[napi(object)]
struct TelemetryPoint {
  pub ts: String,
  pub machineId: String,
  pub elapsedSeconds: f64,
  pub btC: Option<f64>,
  pub etC: Option<f64>,
  pub gasPct: Option<f64>,
  pub fanPct: Option<f64>,
  pub drumRpm: Option<f64>,
  pub extras: Option<Vec<ExtraEntry>>,
}

#[derive(Debug, Clone)]
#[napi(object)]
struct ExtraEntry {
  pub key: String,
  pub number_value: Option<f64>,
  pub text_value: Option<String>,
}

struct TcpLineParser {
  config: TcpLineDriverConfig,
  csv_header_parsed: bool,
  csv_columns: Vec<String>,
}

impl TcpLineParser {
  fn new(config: TcpLineDriverConfig) -> Self {
    Self { csv_columns: config.csv.columns.clone(), csv_header_parsed: false, config }
  }

  fn reset(&mut self) {
    self.csv_header_parsed = false;
    self.csv_columns = self.config.csv.columns.clone();
  }

  fn parse_line(&mut self, line: &str) -> Result<Option<RawTelemetrySample>, ParseError> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
      return Ok(None);
    }
    match self.config.format {
      FrameFormat::Jsonl => self.parse_json_line(trimmed),
      FrameFormat::Csv => self.parse_csv_line(trimmed),
    }
  }

  fn parse_json_line(&mut self, line: &str) -> Result<Option<RawTelemetrySample>, ParseError> {
    let value: serde_json::Value = serde_json::from_str(line).map_err(|_| ParseError::InvalidJson)?;
    let map = value
      .as_object()
      .cloned()
      .ok_or(ParseError::InvalidJson)?
      .into_iter()
      .collect::<Vec<_>>();
    self.to_sample(map)
  }

  fn parse_csv_line(&mut self, line: &str) -> Result<Option<RawTelemetrySample>, ParseError> {
    let parts = line.split(&self.config.csv.delimiter).map(|p| p.trim().to_owned()).collect::<Vec<_>>();
    if self.config.csv.has_header && !self.csv_header_parsed {
      self.csv_columns = parts;
      self.csv_header_parsed = true;
      return Ok(None);
    }

    let columns = if !self.csv_columns.is_empty() {
      self.csv_columns.clone()
    } else {
      vec![
        "ts".to_string(),
        "btC".to_string(),
        "etC".to_string(),
        "powerPct".to_string(),
        "fanPct".to_string(),
        "drumRpm".to_string(),
      ]
    };

    let mut map = Vec::new();
    for (idx, value) in parts.into_iter().enumerate() {
      if let Some(key) = columns.get(idx) {
        map.push((key.clone(), serde_json::Value::String(value)));
      }
    }

    self.to_sample(map)
  }

  fn to_sample(&self, record: Vec<(String, serde_json::Value)>) -> Result<Option<RawTelemetrySample>, ParseError> {
    let mut ts_value: Option<DateTime<Utc>> = None;
    for (key, value) in record.iter() {
      if key == "ts" {
        if let Some(ts) = value.as_str() {
          ts_value = Some(parse_timestamp(ts)?);
        }
      }
    }

    let ts = ts_value.unwrap_or_else(Utc::now);

    let mut extras = Vec::<ExtraEntry>::new();
    let mut sample = RawTelemetrySample {
      ts,
      bt_c: None,
      et_c: None,
      power_pct: None,
      fan_pct: None,
      drum_rpm: None,
      extras: None,
    };

    for (key, value) in record.into_iter() {
      match key.as_str() {
        "btC" => sample.bt_c = parse_number(&value).map(|v| v + self.config.offsets.bt_c),
        "etC" => sample.et_c = parse_number(&value).map(|v| v + self.config.offsets.et_c),
        "powerPct" => sample.power_pct = parse_number(&value),
        "fanPct" => sample.fan_pct = parse_number(&value),
        "drumRpm" => sample.drum_rpm = parse_number(&value),
        "ts" => {}
        _ => {
          if RESERVED_KEYS.contains(&key.as_str()) {
            continue;
          }
          if let Some(num) = parse_number(&value) {
            extras.push(ExtraEntry { key, number_value: Some(num), text_value: None });
          } else if let Some(text) = value.as_str() {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
              extras.push(ExtraEntry { key, number_value: None, text_value: Some(trimmed.to_string()) });
            }
          }
        }
      }
    }

    let has_channels =
      sample.bt_c.is_some() || sample.et_c.is_some() || sample.power_pct.is_some() || sample.fan_pct.is_some() || sample.drum_rpm.is_some();

    if !extras.is_empty() {
      sample.extras = Some(extras);
    }

    if !has_channels && sample.extras.is_none() {
      return Ok(None);
    }

    Ok(Some(sample))
  }
}

fn parse_number(value: &serde_json::Value) -> Option<f64> {
  match value {
    serde_json::Value::Number(n) => n.as_f64(),
    serde_json::Value::String(s) => {
      if s.is_empty() {
        None
      } else {
        s.parse::<f64>().ok()
      }
    }
    _ => None,
  }
}

fn parse_timestamp(value: &str) -> Result<DateTime<Utc>, ParseError> {
  DateTime::parse_from_rfc3339(value)
    .map(|dt| dt.with_timezone(&Utc))
    .map_err(|_| ParseError::InvalidTimestamp)
}

#[derive(Debug, Error)]
enum ParseError {
  #[error("invalid json")]
  InvalidJson,
  #[error("invalid timestamp")]
  InvalidTimestamp,
}

struct DriverInner {
  config: TcpLineDriverConfig,
  machine_id: String,
  parser: Mutex<TcpLineParser>,
  state: Mutex<DriverState>,
  metrics: Mutex<DriverMetrics>,
  latest_sample: Mutex<Option<RawTelemetrySample>>,
  start_ts: Mutex<Option<DateTime<Utc>>>,
  stop_flag: AtomicBool,
  notify_sample: tokio::sync::Notify,
  notify_state: tokio::sync::Notify,
  backoff: Mutex<Backoff>,
  handle: Mutex<Option<JoinHandle<()>>>,
}

impl DriverInner {
  fn new(config: TcpLineDriverConfig, machine_id: String) -> Arc<Self> {
    let parser = TcpLineParser::new(config.clone());
    Arc::new(Self {
      config,
      machine_id,
      parser: Mutex::new(parser),
      state: Mutex::new(DriverState::DISCONNECTED),
      metrics: Mutex::new(DriverMetrics::default()),
      latest_sample: Mutex::new(None),
      start_ts: Mutex::new(None),
      stop_flag: AtomicBool::new(false),
      notify_sample: tokio::sync::Notify::new(),
      notify_state: tokio::sync::Notify::new(),
      backoff: Mutex::new(Backoff::new(0, 0)),
      handle: Mutex::new(None),
    })
  }

  fn ensure_loop(self: &Arc<Self>) {
    let mut handle_guard = self.handle.lock();
    if let Some(handle) = handle_guard.as_ref() {
      if !handle.is_finished() {
        return;
      }
    }
    self.stop_flag.store(false, Ordering::Relaxed);
    let mut backoff = self.backoff.lock();
    backoff.min = self.config.reconnect.min_backoff_ms;
    backoff.max = self.config.reconnect.max_backoff_ms;
    backoff.reset();
    drop(backoff);
    let runner = Arc::clone(self);
    *handle_guard = Some(tokio::spawn(async move { runner.run_loop().await }));
  }

  async fn run_loop(self: Arc<Self>) {
    loop {
      if self.stop_flag.load(Ordering::Relaxed) {
        break;
      }

      self.set_state(DriverState::CONNECTING);
      self.reset_connection_state();

      match TcpStream::connect((self.config.host.as_str(), self.config.port)).await {
        Ok(stream) => {
          self.handle_connected(stream).await;
        }
        Err(err) => {
          self.handle_failure(format!("connection failure: {}", err)).await;
        }
      }

      if self.stop_flag.load(Ordering::Relaxed) {
        break;
      }

      if !self.config.reconnect.enabled {
        break;
      }

      {
        let mut metrics = self.metrics.lock();
        metrics.reconnects = metrics.reconnects.saturating_add(1);
      }

      let delay = { self.backoff.lock().next() };
      sleep(Duration::from_millis(delay)).await;
    }

    let final_state = if self.stop_flag.load(Ordering::Relaxed) {
      DriverState::STOPPED
    } else {
      DriverState::DISCONNECTED
    };
    self.set_state(final_state);
  }

  async fn handle_connected(&self, stream: TcpStream) {
    {
      let mut backoff = self.backoff.lock();
      backoff.reset();
    }
    {
      let mut metrics = self.metrics.lock();
      metrics.lastError = None;
    }
    self.set_state(DriverState::CONNECTED);
    let mut reader = BufReader::new(stream);
    let mut buf = String::new();

    loop {
      if self.stop_flag.load(Ordering::Relaxed) {
        break;
      }

      buf.clear();
      let read = reader.read_line(&mut buf).await;
      match read {
        Ok(0) => {
          self.handle_failure("socket closed".to_string()).await;
          break;
        }
        Ok(_) => {
          {
            let mut metrics = self.metrics.lock();
            metrics.linesReceived = metrics.linesReceived.saturating_add(1);
          }
          if let Err(err) = self.process_line(buf.trim_end_matches(['\n', '\r']).trim_end()) {
            let mut metrics = self.metrics.lock();
            metrics.parseErrors = metrics.parseErrors.saturating_add(1);
            metrics.lastError = Some(err.to_string());
          }
        }
        Err(err) => {
          self.handle_failure(format!("socket error: {}", err)).await;
          break;
        }
      }
    }
  }

  fn process_line(&self, line: &str) -> Result<(), ParseError> {
    let mut parser = self.parser.lock();
    if let Some(sample) = parser.parse_line(line)? {
      self.accept_sample(sample);
    }
    Ok(())
  }

  fn accept_sample(&self, sample: RawTelemetrySample) {
    let mut latest_guard = self.latest_sample.lock();
    if let Some(latest) = latest_guard.as_ref() {
      let delta = sample.ts.signed_duration_since(latest.ts).num_milliseconds();
      if self.config.dedupe_within_ms > 0 && delta < self.config.dedupe_within_ms as i64 {
        return;
      }
    }

    *latest_guard = Some(sample.clone());
    drop(latest_guard);

    {
      let mut start_ts = self.start_ts.lock();
      if start_ts.is_none() {
        *start_ts = Some(sample.ts);
      }
    }

    {
      let mut metrics = self.metrics.lock();
      metrics.linesParsed = metrics.linesParsed.saturating_add(1);
      metrics.lastLineAt = Some(sample.ts.to_rfc3339_opts(SecondsFormat::Millis, true));
    }

    self.notify_sample.notify_waiters();
  }

  async fn handle_failure(&self, msg: String) {
    {
      let mut metrics = self.metrics.lock();
      metrics.lastError = Some(msg.clone());
    }
    self.parser.lock().reset();
    *self.start_ts.lock() = None;
    *self.latest_sample.lock() = None;
    self.notify_sample.notify_waiters();
    self.set_state(if self.stop_flag.load(Ordering::Relaxed) {
      DriverState::STOPPED
    } else {
      DriverState::DISCONNECTED
    });
  }

  fn reset_connection_state(&self) {
    self.parser.lock().reset();
    *self.latest_sample.lock() = None;
    *self.start_ts.lock() = None;
  }

  async fn wait_for_connected(&self) -> Result<()> {
    loop {
      let state = *self.state.lock();
      match state {
        DriverState::CONNECTED => return Ok(()),
        DriverState::STOPPED => return Err(Error::from_reason("driver stopped")),
        DriverState::DISCONNECTED if !self.config.reconnect.enabled => {
          let message = self.metrics.lock().lastError.clone().unwrap_or_else(|| "disconnected".to_string());
          return Err(Error::from_reason(message));
        }
        _ => {}
      }
      self.notify_state.notified().await;
    }
  }

  fn set_state(&self, state: DriverState) {
    let mut guard = self.state.lock();
    *guard = state;
    self.notify_state.notify_waiters();
  }

  async fn wait_for_sample(&self) -> Result<()> {
    let timeout_ms = (self.config.emit_interval_ms * 2).max(500);
    loop {
      if self.stop_flag.load(Ordering::Relaxed) {
        return Err(Error::from_reason("driver stopped"));
      }
      if self.latest_sample.lock().is_some() {
        return Ok(());
      }
      let notified = self.notify_sample.notified();
      match tokio::time::timeout(Duration::from_millis(timeout_ms), notified).await {
        Ok(_) => continue,
        Err(_) => return Err(Error::from_reason("no telemetry yet")),
      }
    }
  }

  async fn read_telemetry(&self) -> Result<TelemetryPoint> {
    self.wait_for_sample().await?;
    let sample = {
      self.latest_sample
        .lock()
        .clone()
        .ok_or_else(|| Error::from_reason("no telemetry yet"))?
    };

    let elapsed_seconds = {
      let mut start_ts = self.start_ts.lock();
      let base = start_ts.get_or_insert(sample.ts);
      let delta_ms = sample
        .ts
        .signed_duration_since(*base)
        .num_milliseconds()
        .max(0) as f64;
      delta_ms / 1000.0
    };

    {
      let mut metrics = self.metrics.lock();
      metrics.telemetryEmitted = metrics.telemetryEmitted.saturating_add(1);
    }

    Ok(TelemetryPoint {
      ts: sample.ts.to_rfc3339_opts(SecondsFormat::Millis, true),
      machineId: self.machine_id.clone(),
      elapsedSeconds: elapsed_seconds,
      btC: sample.bt_c,
      etC: sample.et_c,
      gasPct: sample.power_pct,
      fanPct: sample.fan_pct,
      drumRpm: sample.drum_rpm,
      extras: sample.extras,
    })
  }

  fn get_status(&self) -> DriverStatus {
    DriverStatus { state: *self.state.lock(), metrics: self.metrics.lock().clone() }
  }

  async fn disconnect(&self) {
    self.stop_flag.store(true, Ordering::Relaxed);
    self.set_state(DriverState::STOPPED);
    self.notify_sample.notify_waiters();
    if let Some(handle) = self.handle.lock().take() {
      handle.abort();
    }
  }
}

#[napi]
pub struct TcpLineDriverNative {
  inner: Arc<DriverInner>,
}

#[napi]
impl TcpLineDriverNative {
  #[napi(constructor)]
  pub fn new(config_json: String, machine_id: String) -> Result<Self> {
    let config: TcpLineDriverConfig = serde_json::from_str(&config_json)
      .map_err(|err| Error::from_reason(format!("invalid config: {}", err)))?;
    Ok(Self { inner: DriverInner::new(config, machine_id) })
  }

  #[napi]
  pub async fn connect(&self) -> Result<()> {
    self.inner.ensure_loop();
    self.inner.wait_for_connected().await
  }

  #[napi]
  pub async fn read_telemetry(&self) -> Result<TelemetryPoint> {
    self.inner.read_telemetry().await
  }

  #[napi]
  pub async fn disconnect(&self) -> Result<()> {
    self.inner.disconnect().await;
    Ok(())
  }

  #[napi]
  pub fn get_status(&self) -> Result<DriverStatus> {
    Ok(self.inner.get_status())
  }
}

