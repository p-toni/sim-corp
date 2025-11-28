CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  status TEXT NOT NULL,
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
  result_json TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_missions_status_retry_created ON missions (status, next_retry_at, created_at);
CREATE INDEX IF NOT EXISTS idx_missions_goal_status ON missions (goal, status);
CREATE INDEX IF NOT EXISTS idx_missions_claimed_status ON missions (claimed_by, status);
