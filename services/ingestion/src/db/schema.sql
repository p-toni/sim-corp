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

CREATE TABLE IF NOT EXISTS session_meta (
  session_id TEXT PRIMARY KEY,
  meta_json TEXT NOT NULL,
  actor_json TEXT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  author TEXT NULL,
  actor_json TEXT NULL,
  note_json TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_notes_session_created ON session_notes (session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS event_overrides (
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  elapsed_seconds REAL NOT NULL,
  source TEXT NOT NULL,
  author TEXT NULL,
  actor_json TEXT NULL,
  reason TEXT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (session_id, event_type),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_overrides_session ON event_overrides (session_id);

CREATE TABLE IF NOT EXISTS session_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  report_kind TEXT NOT NULL DEFAULT 'POST_ROAST_V1',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  actor_json TEXT NULL,
  agent_name TEXT NULL,
  agent_version TEXT NULL,
  markdown TEXT NOT NULL,
  report_json TEXT NOT NULL,
  trace_id TEXT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_reports_session_created ON session_reports (session_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_reports_session_kind ON session_reports (session_id, report_kind);
CREATE INDEX IF NOT EXISTS idx_session_reports_report_id ON session_reports (report_id);

CREATE TABLE IF NOT EXISTS roast_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  site_id TEXT NULL,
  machine_model TEXT NULL,
  batch_size_grams REAL NULL,
  targets_json TEXT NOT NULL,
  curve_json TEXT NULL,
  tags_json TEXT NULL,
  notes TEXT NULL,
  source_json TEXT NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0,
  actor_json TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  UNIQUE(org_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_roast_profiles_org_name ON roast_profiles (org_id, name);
CREATE INDEX IF NOT EXISTS idx_roast_profiles_org_site ON roast_profiles (org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_roast_profiles_org_machine ON roast_profiles (org_id, machine_model);

CREATE TABLE IF NOT EXISTS roast_profile_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NULL,
  actor_json TEXT NULL,
  change_note TEXT NULL,
  snapshot_json TEXT NOT NULL,
  UNIQUE(org_id, profile_id, version)
);
