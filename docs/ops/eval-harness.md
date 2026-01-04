# Evaluation Harness

## Overview

The evaluation harness quantifies roasting outcome improvements and gates autonomy promotion (L2 → L3) with hard evidence. As of **T-028**, the system can:

- Define golden roast cases with target metrics and tolerances
- Evaluate roast sessions against golden cases
- Calculate detailed metrics (timing, temperature, RoR stability, variance)
- Determine pass/fail based on promotion gates
- Track evaluation history and promotion eligibility

## Architecture

### Components

1. **Eval Service** (`services/eval`)
   - REST API for golden cases and evaluations
   - Metrics calculation engine
   - Pass/fail evaluation logic
   - SQLite-based storage

2. **Golden Cases** - Reference roasts with:
   - Bean metadata (origin, processing, variety, crop year)
   - Machine setup (model, batch size, charge temp)
   - Target outcomes (FC/drop times, development %, temperatures, roast color)
   - Tolerances (acceptable error ranges for each metric)
   - RoR constraints (max spikes/crashes allowed)
   - Sensory baseline (cupping scores, expected notes)

3. **Eval Runs** - Evaluation results containing:
   - Calculated metrics vs targets
   - Pass/fail determination
   - Gate status (which constraints passed/failed)
   - Optional LM-as-judge scores
   - Human review workflow

## Creating Golden Cases

### Via API

```bash
curl -X POST http://127.0.0.1:4007/golden-cases \
  -H "content-type: application/json" \
  -d '{
    "name": "Ethiopian Yirgacheffe Light",
    "description": "Washed Yirgacheffe, floral and citrus notes",
    "origin": "Ethiopia",
    "processingMethod": "Washed",
    "variety": "Heirloom",
    "machineId": "LORING-S35",
    "batchSizeKg": 15,
    "chargeTempC": 200,
    "targetFirstCrackSeconds": 480,
    "targetDropSeconds": 660,
    "targetDevelopmentPercentage": 20,
    "targetFCTempC": 196,
    "targetDropTempC": 210,
    "targetRoastColor": "Agtron 60",
    "fcSecondsErrorTolerance": 30,
    "dropSecondsErrorTolerance": 30,
    "devPercentageErrorTolerance": 2,
    "maxRorSpikes": 2,
    "maxRorCrashes": 1,
    "sensoryRange": {
      "minScore": 85,
      "notes": ["floral", "citrus", "bergamot", "jasmine"]
    },
    "tags": ["light", "washed", "ethiopia"],
    "createdBy": "roaster-alice"
  }'
```

### Response

```json
{
  "id": "golden-a1b2c3d4...",
  "name": "Ethiopian Yirgacheffe Light",
  "machineId": "LORING-S35",
  "targetFirstCrackSeconds": 480,
  "targetDropSeconds": 660,
  "fcSecondsErrorTolerance": 30,
  ...
}
```

## Running Evaluations

### Automatic Evaluation (Future)

The eval service can be integrated with the report workflow to automatically evaluate sessions against relevant golden cases based on machine ID and batch size.

### Manual Evaluation via API

```bash
curl -X POST http://127.0.0.1:4007/evaluations/run \
  -H "content-type: application/json" \
  -d '{
    "sessionId": "session-abc123",
    "goldenCaseId": "golden-a1b2c3d4...",
    "analysis": {
      "sessionId": "session-abc123",
      "analyzedAt": "2026-01-04T00:00:00Z",
      "turningPoint": { "tempC": 95, "elapsedSeconds": 60 },
      "firstCrack": { "tempC": 196, "elapsedSeconds": 485 },
      "drop": { "tempC": 210, "elapsedSeconds": 665 },
      "developmentRatio": { "value": 0.21, "classification": "MEDIUM", "details": {} },
      "crashFlick": { "detected": false, "confidence": 0, "details": {} }
    },
    "orgId": "acme-roasters"
  }'
```

### Response

```json
{
  "id": "eval-xyz789...",
  "sessionId": "session-abc123",
  "goldenCaseId": "golden-a1b2c3d4...",
  "runAt": "2026-01-04T19:00:00Z",
  "outcome": "PASS",
  "passedGates": ["fc_timing", "drop_timing", "development_ratio"],
  "failedGates": [],
  "detailedMetrics": {
    "fcSecondsError": 5,
    "dropSecondsError": 5,
    "developmentRatioError": 0.01,
    "rorSpikes": 1,
    "rorCrashes": 0
  },
  "orgId": "acme-roasters"
}
```

## Metrics Explained

### Timing Metrics

- **fcSecondsError**: Absolute difference between actual and target first crack time
- **dropSecondsError**: Absolute difference between actual and target drop time
- **developmentRatioError**: Absolute difference in development ratio (0-1 scale)

### Temperature Metrics

- **fcTempError**: Absolute difference between actual and target FC temperature
- **dropTempError**: Absolute difference between actual and target drop temperature

### RoR Stability

- **rorSpikes**: Number of sudden RoR increases detected (> 2 std devs above mean)
- **rorCrashes**: Number of sudden RoR decreases detected (> 2 std devs below mean)
- **rorStdDev**: Standard deviation of RoR values (lower is more stable)

### Variance Metrics (Future)

- **timingVariance**: Variance vs historical baseline for this SKU
- **tempVariance**: Temperature variance vs historical baseline

### Sensory Metrics (Future)

- **cuppingScore**: Cupping score from quality control
- **cuppingScoreDelta**: Change vs baseline cupping score

## Promotion Gates

### Pass Criteria

To achieve `"outcome": "PASS"`:

1. All tolerance checks must pass (timing, temperature, development)
2. RoR stability constraints must be met (spikes/crashes within limits)
3. No failed gates

### Warn Criteria

`"outcome": "WARN"` indicates:

- One gate failed, OR
- All gates passed but warnings were raised (e.g., RoR instability)

### Fail Criteria

`"outcome": "FAIL"` indicates:

- Multiple gates failed
- Critical metrics outside tolerances

### Promotion Eligibility

Check if a session can be promoted to higher autonomy level:

```bash
curl http://127.0.0.1:4007/evaluations/promotion/session-abc123
```

Response:

```json
{
  "allowed": true
}
```

Or if not eligible:

```json
{
  "allowed": false,
  "reason": "No passing evaluations"
}
```

Promotion requirements:
- At least one PASS evaluation exists
- No FAIL evaluations exist
- All critical gates passed

## Querying Evaluations

### Get evaluations for a session

```bash
curl http://127.0.0.1:4007/evaluations?sessionId=session-abc123
```

### Get evaluations for a golden case

```bash
curl http://127.0.0.1:4007/evaluations?goldenCaseId=golden-a1b2c3d4...
```

### List all golden cases

```bash
curl http://127.0.0.1:4007/golden-cases
```

### Filter golden cases

```bash
curl "http://127.0.0.1:4007/golden-cases?machineId=LORING-S35&archived=false"
```

## Database Schema

### golden_cases Table

- **id**: Primary key
- **name**: Display name
- **description**: Optional description
- **origin, processing_method, variety, crop_year**: Bean metadata
- **machine_id**: Machine this case applies to
- **batch_size_kg**: Target batch size
- **charge_temp_c**: Charge temperature
- **target_fc_seconds, target_drop_seconds**: Target timing
- **target_dev_percentage**: Target development ratio (%)
- **target_fc_temp_c, target_drop_temp_c**: Target temperatures
- **fc_seconds_tolerance, drop_seconds_tolerance, dev_percentage_tolerance**: Error tolerances
- **max_ror_spikes, max_ror_crashes**: RoR stability limits
- **sensory_min_score, sensory_notes_json**: Sensory expectations
- **created_at, created_by**: Audit fields
- **tags_json**: Categorization tags
- **archived**: Soft delete flag

### eval_runs Table

- **id**: Primary key
- **session_id**: Session being evaluated
- **mission_id**: Optional mission reference
- **golden_case_id**: Foreign key to golden_cases
- **run_at**: Evaluation timestamp
- **evaluator_id**: Who/what ran the evaluation
- **outcome**: PASS/WARN/FAIL/NEEDS_REVIEW
- **passed_gates_json, failed_gates_json**: Gate results
- **detailed_metrics_json**: Calculated metrics
- **lm_judge_json**: Optional LM-as-judge scores
- **human_reviewed**: Human review flag
- **human_outcome, human_notes**: Human override
- **reviewed_by, reviewed_at**: Review audit
- **org_id**: Organization
- **notes, artifacts_json**: Additional metadata

## Integration with Governor (Future)

The eval harness is designed to integrate with the Governor agent for autonomy promotion:

1. **Session Closes** → Eval service evaluates against golden cases
2. **Eval Results** → Governor checks promotion eligibility
3. **Promotion Decision** → Governor approves/rejects autonomy level change
4. **Policy Enforcement** → New autonomy level takes effect

## LM-as-Judge (Future)

Future enhancement to score:

- **Plan Clarity** (0-100): How clear and specific the roast plan is
- **Physics Plausibility** (0-100): Whether the plan violates known physics
- **Constraint Respect** (0-100): Whether constraints are honored
- **Safety Score** (0-100): Detection of risky/aggressive parameters

Detected violations:
- Safety warnings (e.g., too aggressive gas steps)
- Physics violations (e.g., impossible RoR behavior)
- Constraint violations (e.g., exceeding limits)

## Roadmap

### P0 (T-028) - COMPLETE
- ✅ Golden case schema and storage
- ✅ Eval run schema and storage
- ✅ Metrics calculator (timing, temp, RoR)
- ✅ Pass/fail evaluator
- ✅ REST API endpoints
- ✅ Promotion eligibility check

### P1 (Next)
- Automatic evaluation on session close
- Integration with report workflow
- LM-as-judge implementation
- Historical baseline variance calculation
- Sensory score integration

### P2 (Future)
- Governor integration for autonomy promotion
- Multi-golden-case evaluation (best match selection)
- Trend analysis across evaluations
- Recommendation engine for improving outcomes
- Export evaluations to training datasets

## Example: Full Workflow

1. **Create golden case** for a new bean origin:
   ```bash
   POST /golden-cases { name, targets, tolerances, ... }
   ```

2. **Roast a batch** and collect telemetry/events

3. **Generate analysis** via analytics service

4. **Run evaluation**:
   ```bash
   POST /evaluations/run { sessionId, goldenCaseId, analysis }
   ```

5. **Check results**:
   ```bash
   GET /evaluations?sessionId=...
   ```

6. **Verify promotion eligibility**:
   ```bash
   GET /evaluations/promotion/:sessionId
   ```

7. **If PASS** → Promote to higher autonomy level (future)
8. **If WARN/FAIL** → Review and adjust process

## Testing

```bash
# Run eval service tests
pnpm --filter @sim-corp/eval test

# Start eval service locally
pnpm --filter @sim-corp/eval dev
# Service runs on http://127.0.0.1:4007
```

## Environment Variables

- `PORT`: HTTP port (default: 4007)
- `HOST`: Bind address (default: 127.0.0.1)
- `EVAL_DB_PATH`: SQLite database path (default: ./data/eval.db)
