-- T-028.2 Phase 2: Real Failure Golden Cases
-- Sourced from "production failures" to serve as regression tests
-- These represent common roasting mistakes and failure modes

-- Category: Underdevelopment Failures

INSERT INTO golden_cases (
  id, name, description,
  machine_id, batch_size_kg, charge_temp_c,
  target_fc_seconds, target_drop_seconds, target_dev_percentage,
  target_fc_temp_c, target_drop_temp_c,
  fc_seconds_tolerance, drop_seconds_tolerance, dev_percentage_tolerance,
  max_ror_spikes, max_ror_crashes,
  expectation, danger_level,
  source_type, source_session_id, failure_mode,
  trials_required, pass_at_k_threshold,
  baseline_commands_json,
  created_at, created_by, tags_json, archived
) VALUES (
  'failure-001-rushed-drop',
  'Regression: Rushed Drop (9% Development)',
  'Roast dropped too early after FC resulting in underdevelopment - common beginner mistake',
  'machine-001',
  0.5,
  100.0,
  480, -- FC at 8 minutes
  570, -- Drop only 90 seconds after FC!
  9.0, -- Only 9% development
  196.0,
  205.0,
  15, 15, 1.0, -- Tight tolerances
  2, 0,
  'SHOULD_SUCCEED', -- Agent should avoid this
  'CAUTION',
  'REAL_FAILURE',
  'session-prod-fail-001',
  'Dropped too soon after FC - insufficient development time',
  3,
  0.9,
  '[]',
  datetime('now'),
  'prod-team',
  '["regression", "underdevelopment", "timing"]',
  0
);

INSERT INTO golden_cases (
  id, name, description,
  machine_id, batch_size_kg,
  target_fc_seconds, target_drop_seconds, target_dev_percentage,
  fc_seconds_tolerance, drop_seconds_tolerance, dev_percentage_tolerance,
  max_ror_spikes, max_ror_crashes,
  expectation, danger_level,
  source_type, source_session_id, failure_mode,
  trials_required, pass_at_k_threshold,
  baseline_commands_json,
  created_at, created_by, tags_json, archived
) VALUES (
  'failure-002-low-power-stall',
  'Regression: Power Too Low - Roast Stalled',
  'Insufficient heat applied, roast took 25 minutes and stalled before FC',
  'machine-001',
  0.5,
  1500, -- FC at 25 minutes! (way too long)
  1680,
  8.0,
  60, 60, 2.0,
  5, 3,
  'SHOULD_SUCCEED',
  'CAUTION',
  'REAL_FAILURE',
  'session-prod-fail-002',
  'Roast stalled due to insufficient heat input - baked beans',
  3,
  0.9,
  '[]',
  datetime('now'),
  'prod-team',
  '["regression", "stalled", "underpowered", "baked"]',
  0
);

-- Category: Scorching Failures

INSERT INTO golden_cases (
  id, name, description,
  machine_id, batch_size_kg, charge_temp_c,
  target_fc_seconds, target_drop_seconds, target_dev_percentage,
  target_fc_temp_c, target_drop_temp_c,
  fc_seconds_tolerance, drop_seconds_tolerance, dev_percentage_tolerance,
  max_ror_spikes, max_ror_crashes,
  expectation, danger_level,
  source_type, source_session_id, failure_mode,
  trials_required, pass_at_k_threshold,
  baseline_commands_json,
  created_at, created_by, tags_json, archived
) VALUES (
  'failure-003-post-fc-spike',
  'Regression: Tipping Due to Post-FC Heat Spike',
  'Excessive heat after FC caused scorching/tipping on bean surface',
  'machine-001',
  0.5,
  100.0,
  420, -- FC at 7 minutes (fast)
  520, -- Drop shortly after
  12.0,
  196.0,
  228.0, -- Hot drop temp
  15, 15, 1.0,
  1, 0, -- Very strict on spikes
  'SHOULD_SUCCEED',
  'CAUTION',
  'REAL_FAILURE',
  'session-prod-fail-003',
  'Scorching/tipping due to excessive heat after first crack',
  3,
  0.9,
  '[]',
  datetime('now'),
  'prod-team',
  '["regression", "scorching", "tipping", "heat-spike"]',
  0
);

INSERT INTO golden_cases (
  id, name, description,
  machine_id, batch_size_kg, charge_temp_c,
  target_fc_seconds, target_drop_seconds, target_dev_percentage,
  target_fc_temp_c, target_drop_temp_c,
  fc_seconds_tolerance, drop_seconds_tolerance, dev_percentage_tolerance,
  max_ror_spikes, max_ror_crashes,
  expectation, danger_level,
  source_type, source_session_id, failure_mode,
  trials_required, pass_at_k_threshold,
  baseline_commands_json,
  created_at, created_by, tags_json, archived
) VALUES (
  'failure-004-charge-scorch',
  'Regression: Scorched on Charge (300°F Charge)',
  'Charge temperature too high - beans scorched immediately',
  'machine-001',
  0.5,
  300.0, -- WAY too hot for charge!
  300, -- Very fast FC
  380,
  15.0,
  196.0,
  220.0,
  10, 10, 1.0,
  2, 0,
  'SHOULD_SUCCEED',
  'DANGER', -- This is dangerous
  'REAL_FAILURE',
  'session-prod-fail-004',
  'Charge temperature excessive - immediate scorching',
  5,
  1.0, -- Must never repeat
  '[]',
  datetime('now'),
  'prod-team',
  '["regression", "scorching", "charge-temp", "dangerous"]',
  0
);

-- Category: RoR Instability

INSERT INTO golden_cases (
  id, name, description,
  machine_id, batch_size_kg,
  target_fc_seconds, target_drop_seconds, target_dev_percentage,
  fc_seconds_tolerance, drop_seconds_tolerance, dev_percentage_tolerance,
  max_ror_spikes, max_ror_crashes,
  expectation, danger_level,
  source_type, source_session_id, failure_mode,
  trials_required, pass_at_k_threshold,
  baseline_commands_json,
  created_at, created_by, tags_json, archived
) VALUES (
  'failure-005-ror-rollercoaster',
  'Regression: Severe RoR Instability (12 Spikes)',
  'Temperature control erratic - 12 RoR spikes detected',
  'machine-001',
  0.5,
  480, 660, 18.0,
  30, 30, 2.0,
  2, 1, -- Max 2 spikes allowed
  'SHOULD_SUCCEED',
  'CAUTION',
  'REAL_FAILURE',
  'session-prod-fail-005',
  'Severe RoR instability indicating poor heat control',
  3,
  0.9,
  '[]',
  datetime('now'),
  'prod-team',
  '["regression", "ror-instability", "spikes"]',
  0
);

INSERT INTO golden_cases (
  id, name, description,
  machine_id, batch_size_kg,
  target_fc_seconds, target_drop_seconds, target_dev_percentage,
  fc_seconds_tolerance, drop_seconds_tolerance, dev_percentage_tolerance,
  max_ror_spikes, max_ror_crashes,
  expectation, danger_level,
  source_type, source_session_id, failure_mode,
  trials_required, pass_at_k_threshold,
  baseline_commands_json,
  created_at, created_by, tags_json, archived
) VALUES (
  'failure-006-ror-crash-flick',
  'Regression: RoR Crash-Flick Pattern',
  'Sudden RoR crash followed by spike - indicates thermal shock',
  'machine-001',
  0.5,
  480, 660, 18.0,
  30, 30, 2.0,
  1, 0, -- Zero crashes allowed
  'SHOULD_SUCCEED',
  'CAUTION',
  'REAL_FAILURE',
  'session-prod-fail-006',
  'RoR crash-flick pattern detected - thermal shock event',
  3,
  0.9,
  '[]',
  datetime('now'),
  'prod-team',
  '["regression", "ror-crash", "thermal-shock"]',
  0
);

-- Category: Timing Inconsistency

INSERT INTO golden_cases (
  id, name, description,
  machine_id, batch_size_kg,
  target_fc_seconds, target_drop_seconds, target_dev_percentage,
  fc_seconds_tolerance, drop_seconds_tolerance, dev_percentage_tolerance,
  max_ror_spikes, max_ror_crashes,
  expectation, danger_level,
  source_type, source_session_id, failure_mode,
  trials_required, pass_at_k_threshold,
  baseline_commands_json,
  created_at, created_by, tags_json, archived
) VALUES (
  'failure-007-fc-way-too-early',
  'Regression: FC at 3 Minutes (Too Fast)',
  'First crack occurred 3 minutes early - roast rushed',
  'machine-001',
  0.5,
  300, -- FC at 5 minutes (should be 8)
  400,
  17.0,
  15, 15, 1.0,
  2, 1,
  'SHOULD_SUCCEED',
  'CAUTION',
  'REAL_FAILURE',
  'session-prod-fail-007',
  'First crack way too early - roast progressed too quickly',
  3,
  0.9,
  '[]',
  datetime('now'),
  'prod-team',
  '["regression", "fc-early", "timing", "rushed"]',
  0
);

INSERT INTO golden_cases (
  id, name, description,
  machine_id, batch_size_kg,
  target_fc_seconds, target_drop_seconds, target_dev_percentage,
  fc_seconds_tolerance, drop_seconds_tolerance, dev_percentage_tolerance,
  max_ror_spikes, max_ror_crashes,
  expectation, danger_level,
  source_type, source_session_id, failure_mode,
  trials_required, pass_at_k_threshold,
  baseline_commands_json,
  created_at, created_by, tags_json, archived
) VALUES (
  'failure-008-fc-way-too-late',
  'Regression: FC at 15 Minutes (Baked)',
  'First crack delayed to 15 minutes - beans baked not roasted',
  'machine-001',
  0.5,
  900, -- FC at 15 minutes (should be 8)
  1050,
  8.0,
  30, 30, 1.0,
  3, 2,
  'SHOULD_SUCCEED',
  'CAUTION',
  'REAL_FAILURE',
  'session-prod-fail-008',
  'First crack severely delayed - baking instead of roasting',
  3,
  0.9,
  '[]',
  datetime('now'),
  'prod-team',
  '["regression", "fc-late", "timing", "baked"]',
  0
);

-- Category: Development Ratio Issues

INSERT INTO golden_cases (
  id, name, description,
  machine_id, batch_size_kg,
  target_fc_seconds, target_drop_seconds, target_dev_percentage,
  fc_seconds_tolerance, drop_seconds_tolerance, dev_percentage_tolerance,
  max_ror_spikes, max_ror_crashes,
  expectation, danger_level,
  source_type, source_session_id, failure_mode,
  trials_required, pass_at_k_threshold,
  baseline_commands_json,
  created_at, created_by, tags_json, archived
) VALUES (
  'failure-009-excessive-development',
  'Regression: 35% Development (Over-Roasted)',
  'Development phase too long - beans over-developed and dark',
  'machine-001',
  0.5,
  420, -- FC at 7 minutes
  870, -- Drop 7.5 minutes after FC!
  35.0, -- Way too much development
  196.0,
  215.0,
  15, 20, 2.0,
  2, 1,
  'SHOULD_SUCCEED',
  'CAUTION',
  'REAL_FAILURE',
  'session-prod-fail-009',
  'Excessive development time - beans over-roasted',
  3,
  0.9,
  '[]',
  datetime('now'),
  'prod-team',
  '["regression", "over-development", "dark-roast"]',
  0
);

INSERT INTO golden_cases (
  id, name, description,
  machine_id, batch_size_kg,
  target_fc_seconds, target_drop_seconds, target_dev_percentage,
  fc_seconds_tolerance, drop_seconds_tolerance, dev_percentage_tolerance,
  max_ror_spikes, max_ror_crashes,
  expectation, danger_level,
  source_type, source_session_id, failure_mode,
  trials_required, pass_at_k_threshold,
  baseline_commands_json,
  created_at, created_by, tags_json, archived
) VALUES (
  'failure-010-zero-development',
  'Regression: 2% Development (Grassy)',
  'Virtually no development - beans taste grassy and underdeveloped',
  'machine-001',
  0.5,
  480,
  510, -- Drop only 30 seconds after FC
  2.0, -- Almost zero development
  196.0,
  200.0,
  10, 10, 0.5,
  1, 0,
  'SHOULD_SUCCEED',
  'CAUTION',
  'REAL_FAILURE',
  'session-prod-fail-010',
  'Insufficient development - grassy, underdeveloped flavors',
  3,
  0.9,
  '[]',
  datetime('now'),
  'prod-team',
  '["regression", "under-development", "grassy"]',
  0
);

-- Category: Bean-Specific Failures

INSERT INTO golden_cases (
  id, name, description,
  machine_id, origin, processing_method, variety,
  batch_size_kg, charge_temp_c,
  target_fc_seconds, target_drop_seconds, target_dev_percentage,
  target_fc_temp_c, target_drop_temp_c,
  fc_seconds_tolerance, drop_seconds_tolerance, dev_percentage_tolerance,
  max_ror_spikes, max_ror_crashes,
  expectation, danger_level,
  source_type, source_session_id, failure_mode,
  trials_required, pass_at_k_threshold,
  baseline_commands_json,
  created_at, created_by, tags_json, archived
) VALUES (
  'failure-011-ethiopian-tipped',
  'Regression: Ethiopian Yirgacheffe Tipped',
  'Ethiopian beans scorched on surface - too aggressive heat',
  'machine-001',
  'Ethiopia',
  'Washed',
  'Heirloom',
  0.5,
  105.0,
  390, -- Fast roast
  480,
  12.0,
  196.0,
  224.0, -- Hot finish
  15, 15, 1.0,
  1, 0,
  'SHOULD_SUCCEED',
  'CAUTION',
  'REAL_FAILURE',
  'session-prod-fail-011',
  'Ethiopian beans tipped due to excessive heat - lost delicate florals',
  3,
  0.9,
  '[]',
  datetime('now'),
  'prod-team',
  '["regression", "ethiopia", "tipping", "origin-specific"]',
  0
);

INSERT INTO golden_cases (
  id, name, description,
  machine_id, origin, processing_method, variety,
  batch_size_kg,
  target_fc_seconds, target_drop_seconds, target_dev_percentage,
  fc_seconds_tolerance, drop_seconds_tolerance, dev_percentage_tolerance,
  max_ror_spikes, max_ror_crashes,
  expectation, danger_level,
  source_type, source_session_id, failure_mode,
  trials_required, pass_at_k_threshold,
  baseline_commands_json,
  created_at, created_by, tags_json, archived
) VALUES (
  'failure-012-brazil-baked',
  'Regression: Brazil Natural Baked',
  'Brazilian natural processed beans baked - lost fruit sweetness',
  'machine-001',
  'Brazil',
  'Natural',
  'Bourbon',
  0.5,
  1200, -- Long, low roast
  1380,
  8.0,
  45, 45, 1.0,
  4, 2,
  'SHOULD_SUCCEED',
  'CAUTION',
  'REAL_FAILURE',
  'session-prod-fail-012',
  'Natural processed beans baked - flat, woody flavors instead of fruit',
  3,
  0.9,
  '[]',
  datetime('now'),
  'prod-team',
  '["regression", "brazil", "natural", "baked", "origin-specific"]',
  0
);

-- Category: Equipment-Related Failures

INSERT INTO golden_cases (
  id, name, description,
  machine_id, batch_size_kg,
  target_fc_seconds, target_drop_seconds, target_dev_percentage,
  fc_seconds_tolerance, drop_seconds_tolerance, dev_percentage_tolerance,
  max_ror_spikes, max_ror_crashes,
  expectation, danger_level,
  source_type, source_session_id, failure_mode,
  trials_required, pass_at_k_threshold,
  baseline_commands_json,
  created_at, created_by, tags_json, archived
) VALUES (
  'failure-013-undersized-batch',
  'Regression: 100g Batch in 500g Roaster (Too Small)',
  'Batch size too small - unpredictable heat behavior',
  'machine-001',
  0.1, -- Only 100g
  360, -- Very fast
  450,
  13.0,
  20, 20, 1.5,
  3, 2,
  'SHOULD_SUCCEED',
  'CAUTION',
  'REAL_FAILURE',
  'session-prod-fail-013',
  'Batch size too small for roaster - erratic heat transfer',
  3,
  0.9,
  '[]',
  datetime('now'),
  'prod-team',
  '["regression", "batch-size", "underfill"]',
  0
);

INSERT INTO golden_cases (
  id, name, description,
  machine_id, batch_size_kg, charge_temp_c,
  target_fc_seconds, target_drop_seconds, target_dev_percentage,
  fc_seconds_tolerance, drop_seconds_tolerance, dev_percentage_tolerance,
  max_ror_spikes, max_ror_crashes,
  expectation, danger_level,
  source_type, source_session_id, failure_mode,
  trials_required, pass_at_k_threshold,
  baseline_commands_json,
  created_at, created_by, tags_json, archived
) VALUES (
  'failure-014-cold-start',
  'Regression: Cold Machine Start (70°F Charge)',
  'Roaster not preheated - charge temp too low',
  'machine-001',
  0.5,
  70.0, -- Room temp charge!
  720, -- Very slow FC
  900,
  13.0,
  30, 30, 1.5,
  4, 2,
  'SHOULD_SUCCEED',
  'CAUTION',
  'REAL_FAILURE',
  'session-prod-fail-014',
  'Machine not preheated - cold start resulted in long, uneven roast',
  3,
  0.9,
  '[]',
  datetime('now'),
  'prod-team',
  '["regression", "cold-start", "preheat"]',
  0
);

-- Category: Second Crack Issues

INSERT INTO golden_cases (
  id, name, description,
  machine_id, batch_size_kg,
  target_fc_seconds, target_drop_seconds, target_dev_percentage,
  target_fc_temp_c, target_drop_temp_c,
  fc_seconds_tolerance, drop_seconds_tolerance, dev_percentage_tolerance,
  max_ror_spikes, max_ror_crashes,
  expectation, danger_level,
  source_type, source_session_id, failure_mode,
  trials_required, pass_at_k_threshold,
  baseline_commands_json,
  created_at, created_by, tags_json, archived
) VALUES (
  'failure-015-reached-second-crack',
  'Regression: Reached Second Crack (Too Dark)',
  'Roast went into second crack - too dark for intended profile',
  'machine-001',
  0.5,
  480,
  780, -- Long development
  28.0,
  196.0,
  230.0, -- SC territory
  20, 20, 2.0,
  2, 1,
  'SHOULD_SUCCEED',
  'CAUTION',
  'REAL_FAILURE',
  'session-prod-fail-015',
  'Exceeded intended roast level - reached second crack',
  3,
  0.9,
  '[]',
  datetime('now'),
  'prod-team',
  '["regression", "second-crack", "too-dark"]',
  0
);

-- Metadata: Update schema version
UPDATE schema_migrations SET applied_at = datetime('now') WHERE id = 'real-failure-cases-v1';
INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('real-failure-cases-v1', datetime('now'));
