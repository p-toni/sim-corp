CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  status TEXT NOT NULL,
  subject_id TEXT NULL,
  context_json TEXT NULL,
  signals_json TEXT NULL,
  governance_json TEXT NULL,
  params_json TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_retry_at TEXT NULL,
  last_error_json TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  claimed_by TEXT NULL,
  claimed_at TEXT NULL,
  lease_id TEXT NULL,
  lease_expires_at TEXT NULL,
  last_heartbeat_at TEXT NULL,
  completed_at TEXT NULL,
  failed_at TEXT NULL,
  result_json TEXT NULL,
  actor_json TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_missions_status_retry_created ON missions (status, next_retry_at, created_at);
CREATE INDEX IF NOT EXISTS idx_missions_goal_status ON missions (goal, status);
CREATE INDEX IF NOT EXISTS idx_missions_claimed_status ON missions (claimed_by, status);
CREATE INDEX IF NOT EXISTS idx_missions_subject_goal_status ON missions (subject_id, goal, status);
CREATE INDEX IF NOT EXISTS idx_missions_status_goal_created ON missions (status, goal, created_at);

CREATE TABLE IF NOT EXISTS kernel_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key TEXT PRIMARY KEY,
  tokens REAL NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_keys (
  kid TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  public_key_b64 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT NULL,
  meta_json TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_keys_org_id ON device_keys (org_id);
