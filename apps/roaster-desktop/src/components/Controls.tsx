import type { ChangeEvent } from "react";
import type { AppMode, LiveConfig, PlaybackState, SimMissionParams } from "../lib/types";

interface ControlsProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  params: SimMissionParams;
  onChange: (next: Partial<SimMissionParams>) => void;
  onRun: () => void;
  running: boolean;
  status: string;
  error?: string | null;
  postToKernel: boolean;
  onTogglePost: (value: boolean) => void;
  kernelStatus?: string;
  liveConfig: LiveConfig;
  onLiveConfigChange: (next: Partial<LiveConfig>) => void;
  onStartLive: () => void;
  onStopLive: () => void;
  liveStatus: string;
  liveError?: string | null;
  playback: PlaybackState;
  onSelectSession: (id: string) => void;
  onRefreshSessions: () => void;
  analyticsUrl: string;
  onChangeAnalyticsUrl: (url: string) => void;
}

export function Controls({
  mode,
  onModeChange,
  params,
  onChange,
  onRun,
  running,
  status,
  error,
  postToKernel,
  onTogglePost,
  kernelStatus,
  liveConfig,
  onLiveConfigChange,
  onStartLive,
  onStopLive,
  liveStatus,
  liveError,
  playback,
  onSelectSession,
  onRefreshSessions,
  analyticsUrl,
  onChangeAnalyticsUrl
}: ControlsProps) {
  const handleChange =
    (key: keyof SimMissionParams) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      const nextValue = Number(event.target.value);
      onChange({ [key]: Number.isFinite(nextValue) ? nextValue : 0 });
    };

  const handleLiveChange =
    (key: keyof LiveConfig) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      onLiveConfigChange({ [key]: event.target.value });
    };

  return (
    <div className="panel">
      <div className="mode-toggle">
        <button
          type="button"
          className={mode === "batch" ? "chip active" : "chip"}
          onClick={() => onModeChange("batch")}
        >
          Batch Mode
        </button>
        <button
          type="button"
          className={mode === "live" ? "chip active" : "chip"}
          onClick={() => onModeChange("live")}
        >
          Live Mode
        </button>
        <button
          type="button"
          className={mode === "playback" ? "chip active" : "chip"}
          onClick={() => onModeChange("playback")}
        >
          Playback
        </button>
      </div>
      <h2 className="panel-title">Mission Parameters</h2>
      <div className="form-grid">
        <label className="form-field">
          <span>Target FC (sec)</span>
          <input
            type="number"
            value={params.targetFirstCrackSeconds}
            onChange={handleChange("targetFirstCrackSeconds")}
            min={1}
            step={10}
          />
        </label>
        <label className="form-field">
          <span>Target Drop (sec)</span>
          <input
            type="number"
            value={params.targetDropSeconds}
            onChange={handleChange("targetDropSeconds")}
            min={1}
            step={10}
          />
        </label>
        <label className="form-field">
          <span>Seed</span>
          <input type="number" value={params.seed} onChange={handleChange("seed")} step={1} />
        </label>
        <label className="form-field">
          <span>Noise σ</span>
          <input
            type="number"
            value={params.noiseStdDev}
            onChange={handleChange("noiseStdDev")}
            min={0}
            step={0.1}
          />
        </label>
        <label className="form-field">
          <span>Sample interval (sec)</span>
          <input
            type="number"
            value={params.sampleIntervalSeconds}
            onChange={handleChange("sampleIntervalSeconds")}
            min={0.5}
            step={0.5}
          />
        </label>
      </div>
      {mode === "batch" ? (
        <div className="controls-footer">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={postToKernel}
              onChange={(event) => onTogglePost(event.target.checked)}
              disabled={running}
            />
            <span>Post trace to kernel</span>
          </label>
          {postToKernel ? (
            <div className="muted small-text">
              Kernel status: {kernelStatus ?? "Pending"}
            </div>
          ) : null}
          <button className="primary" type="button" onClick={onRun} disabled={running}>
            {running ? "Running…" : "Run Sim Roast Mission"}
          </button>
          <div className="status-text">
            <strong>Status:</strong> {status}
          </div>
          {error ? <div className="error-text">Error: {error}</div> : null}
        </div>
      ) : mode === "live" ? (
        <div className="controls-footer">
          <h3 className="section-title">Live stream</h3>
          <label className="form-field">
            <span>Ingestion URL</span>
            <input type="text" value={liveConfig.ingestionUrl} onChange={handleLiveChange("ingestionUrl")} />
          </label>
          <div className="form-grid">
            <label className="form-field">
              <span>Org ID</span>
              <input type="text" value={liveConfig.orgId} onChange={handleLiveChange("orgId")} />
            </label>
            <label className="form-field">
              <span>Site ID</span>
              <input type="text" value={liveConfig.siteId} onChange={handleLiveChange("siteId")} />
            </label>
            <label className="form-field">
              <span>Machine ID</span>
              <input type="text" value={liveConfig.machineId} onChange={handleLiveChange("machineId")} />
            </label>
          </div>
          <div className="live-actions">
            <button type="button" className="secondary" onClick={onStartLive}>
              Start Live
            </button>
            <button type="button" className="secondary ghost" onClick={onStopLive}>
              Stop
            </button>
          </div>
          <div className="status-text">
            <strong>Live status:</strong> {liveStatus}
          </div>
          {liveError ? <div className="error-text">Error: {liveError}</div> : null}
        </div>
      ) : (
        <div className="controls-footer">
          <h3 className="section-title">Playback</h3>
          <label className="form-field">
            <span>Analytics URL</span>
            <input
              type="text"
              value={analyticsUrl}
              onChange={(event) => onChangeAnalyticsUrl(event.target.value)}
            />
          </label>
          <button type="button" className="secondary" onClick={onRefreshSessions}>
            Refresh sessions
          </button>
          <label className="form-field">
            <span>Sessions</span>
            <select
              value={playback.selectedSessionId ?? ""}
              onChange={(event) => onSelectSession(event.target.value)}
            >
              <option value="">Select session</option>
              {playback.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {playback.summary ? (
            <div className="muted small-text">
              Started: {playback.summary.startedAt ?? "?"} | Ended: {playback.summary.endedAt ?? "—"}
              <br />
              Duration: {playback.summary.durationSeconds ?? "?"}s | Max BT: {playback.summary.maxBtC ?? "?"}
              <br />
              FC: {playback.summary.fcSeconds ?? "—"} | DROP: {playback.summary.dropSeconds ?? "—"}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
