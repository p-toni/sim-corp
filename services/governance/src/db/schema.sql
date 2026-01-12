-- Governance Service Database Schema
-- Stores autonomy metrics, readiness assessments, circuit breaker events, and governance reports

-- Governance state (singleton table)
CREATE TABLE IF NOT EXISTS governance_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_phase TEXT NOT NULL CHECK (current_phase IN ('L3', 'L3+', 'L4', 'L4+', 'L5')),
  phase_start_date TEXT NOT NULL,
  command_whitelist TEXT NOT NULL, -- JSON array
  last_report_date TEXT,
  last_expansion_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Weekly governance reports
CREATE TABLE IF NOT EXISTS governance_reports (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  generated_at TEXT NOT NULL,

  -- Metrics snapshot (JSON)
  metrics TEXT NOT NULL,

  -- Readiness snapshot (JSON)
  readiness TEXT NOT NULL,

  -- Expansion proposal (JSON, nullable)
  expansion TEXT,

  -- Circuit breaker events (JSON array)
  circuit_breaker_events TEXT NOT NULL,

  -- Summary and recommendations
  summary TEXT NOT NULL,
  recommendations TEXT NOT NULL, -- JSON array
  next_actions TEXT NOT NULL, -- JSON array

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_week ON governance_reports(week_start, week_end);

-- Circuit breaker events
CREATE TABLE IF NOT EXISTS circuit_breaker_events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,

  -- Rule that triggered (JSON)
  rule TEXT NOT NULL,

  -- Metrics at time of trigger (JSON)
  metrics TEXT NOT NULL,

  -- Action taken
  action TEXT NOT NULL CHECK (action IN ('revert_to_l3', 'pause_command_type', 'alert_only')),

  -- Details
  details TEXT NOT NULL,

  -- Resolution tracking
  resolved INTEGER NOT NULL DEFAULT 0,
  resolved_at TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_breaker_events_timestamp ON circuit_breaker_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_breaker_events_resolved ON circuit_breaker_events(resolved);

-- Circuit breaker rules configuration
CREATE TABLE IF NOT EXISTS circuit_breaker_rules (
  name TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  condition TEXT NOT NULL,
  window TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('revert_to_l3', 'pause_command_type', 'alert_only')),
  alert_severity TEXT NOT NULL CHECK (alert_severity IN ('critical', 'high', 'medium', 'low')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Metrics snapshots (historical tracking)
CREATE TABLE IF NOT EXISTS metrics_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,

  -- Command metrics
  commands_total INTEGER NOT NULL,
  commands_proposed INTEGER NOT NULL,
  commands_approved INTEGER NOT NULL,
  commands_rejected INTEGER NOT NULL,
  commands_succeeded INTEGER NOT NULL,
  commands_failed INTEGER NOT NULL,
  commands_rolled_back INTEGER NOT NULL,

  -- Rates
  success_rate REAL NOT NULL,
  approval_rate REAL NOT NULL,
  rollback_rate REAL NOT NULL,
  error_rate REAL NOT NULL,

  -- Incidents
  incidents_total INTEGER NOT NULL,
  incidents_critical INTEGER NOT NULL,
  incidents_from_autonomous INTEGER NOT NULL,

  -- Safety
  constraint_violations INTEGER NOT NULL,
  emergency_aborts INTEGER NOT NULL,
  safety_gate_triggers INTEGER NOT NULL,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON metrics_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_snapshots_period ON metrics_snapshots(period_start, period_end);

-- Readiness assessments (historical tracking)
CREATE TABLE IF NOT EXISTS readiness_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  current_phase TEXT NOT NULL,
  days_since_phase_start INTEGER NOT NULL,

  -- Overall score
  overall_score REAL NOT NULL,
  overall_ready INTEGER NOT NULL,
  overall_blockers TEXT NOT NULL, -- JSON array

  -- Category scores
  technical_score REAL NOT NULL,
  technical_max_score REAL NOT NULL,
  technical_items TEXT NOT NULL, -- JSON array

  process_score REAL NOT NULL,
  process_max_score REAL NOT NULL,
  process_items TEXT NOT NULL, -- JSON array

  organizational_score REAL NOT NULL,
  organizational_max_score REAL NOT NULL,
  organizational_items TEXT NOT NULL, -- JSON array

  -- Recommendations and actions
  recommendations TEXT NOT NULL, -- JSON array
  next_actions TEXT NOT NULL, -- JSON array

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assessments_timestamp ON readiness_assessments(timestamp);

-- Scope expansion proposals
CREATE TABLE IF NOT EXISTS scope_expansion_proposals (
  proposal_id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  proposed_by TEXT NOT NULL DEFAULT 'autonomy-governance-agent',

  -- Expansion details
  current_phase TEXT NOT NULL,
  target_phase TEXT NOT NULL,
  commands_to_whitelist TEXT NOT NULL, -- JSON array
  validation_period INTEGER NOT NULL,

  -- Rationale (JSON objects)
  metrics TEXT NOT NULL,
  readiness TEXT NOT NULL,
  key_achievements TEXT NOT NULL, -- JSON array

  -- Risk assessment
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  mitigations TEXT NOT NULL, -- JSON array
  rollback_plan TEXT NOT NULL,

  -- Approvals
  required_approvals TEXT NOT NULL, -- JSON array

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_at TEXT,
  approved_by TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_proposals_status ON scope_expansion_proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_timestamp ON scope_expansion_proposals(timestamp);

-- Initialize default circuit breaker rules
INSERT OR IGNORE INTO circuit_breaker_rules (name, enabled, condition, window, action, alert_severity) VALUES
  ('High Error Rate', 1, 'errorRate > 0.05', '5m', 'revert_to_l3', 'critical'),
  ('Repeated Command Failures', 1, 'commandType.failures >= 3', '5m', 'pause_command_type', 'high'),
  ('Critical Incident Detected', 1, 'incident.severity === "critical"', '1m', 'revert_to_l3', 'critical'),
  ('High Rollback Rate', 1, 'rollbackRate > 0.1', '15m', 'alert_only', 'medium');

-- Initialize governance state at L3
INSERT OR IGNORE INTO governance_state (id, current_phase, phase_start_date, command_whitelist) VALUES
  (1, 'L3', datetime('now'), '[]');
