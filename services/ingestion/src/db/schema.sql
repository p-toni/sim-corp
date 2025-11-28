CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NULL,
  status TEXT NOT NULL,
  duration_seconds INTEGER NULL,
  fc_seconds INTEGER NULL,
  drop_seconds INTEGER NULL,
  max_bt_c REAL NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_org_site_machine_started
  ON sessions (org_id, site_id, machine_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_status_org_site_machine
  ON sessions (status, org_id, site_id, machine_id);

CREATE TABLE IF NOT EXISTS telemetry_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  elapsed_seconds REAL NOT NULL,
  bt_c REAL,
  et_c REAL,
  ror_c_per_min REAL,
  ambient_c REAL,
  raw_json TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tp_session_elapsed ON telemetry_points (session_id, elapsed_seconds);
CREATE INDEX IF NOT EXISTS idx_tp_session_ts ON telemetry_points (session_id, ts);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  elapsed_seconds REAL NULL,
  type TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events (session_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_session_type ON events (session_id, type);
