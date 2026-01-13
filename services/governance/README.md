# Autonomy Governance Service

The Governance Service manages the progressive expansion of autonomous operations in the Sim-Corp roasting system, ensuring safe and controlled advancement from human-supervised (L3) to high-autonomy (L5) operations.

## Overview

The Autonomy Governance system implements a structured framework for advancing operational autonomy through defined phases (L3 → L3+ → L4 → L4+ → L5), with comprehensive safety controls, readiness assessment, and circuit breakers to prevent runaway automation.

### Key Components

1. **Metrics Collector** - Aggregates command execution data from the command service
2. **Readiness Assessor** - Evaluates 80-point checklist across technical, process, and organizational dimensions
3. **Circuit Breaker** - Monitors safety metrics and automatically reverts to L3 on violations
4. **Governance Agent** - Orchestrates weekly governance cycles and generates expansion proposals
5. **REST API** - Provides endpoints for metrics, readiness, circuit breaker, and governance workflows
6. **Prometheus Exporter** - Exports governance metrics for monitoring and alerting

## Autonomy Levels

### L3: Human in Loop (Baseline)
- All commands require explicit human approval
- System proposes actions, waits for confirmation
- Full visibility into all operations
- **Command Whitelist**: None (all commands require approval)
- **Validation Period**: N/A (baseline)

### L3+: Extended Control
- Low-risk commands automated (temperature, fan speed)
- Human oversight maintained for critical operations
- **Command Whitelist**: SET_POWER, SET_FAN
- **Validation Period**: 14 days
- **Required Approvals**: Tech Lead

### L4: High Automation
- Moderate-risk commands automated (drum speed, airflow)
- Automated profile execution with monitoring
- **Command Whitelist**: SET_DRUM, SET_AIRFLOW (+ L3+ commands)
- **Validation Period**: 21 days
- **Required Approvals**: Tech Lead, Ops Lead

### L4+: Advanced Autonomy
- High-risk commands automated (preheat, cooling cycles)
- Full profile automation with exception handling
- **Command Whitelist**: PREHEAT, COOLING_CYCLE (+ L4 commands)
- **Validation Period**: 30 days
- **Required Approvals**: Tech Lead, Ops Lead, Product Lead

### L5: Full Autonomy
- All commands automated including emergency procedures
- System handles all scenarios autonomously
- **Command Whitelist**: EMERGENCY_SHUTDOWN, ABORT (all commands)
- **Validation Period**: 60 days
- **Required Approvals**: Tech Lead, Ops Lead, Product Lead, Exec Sponsor

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Governance Service (4007)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Metrics    │  │  Readiness   │  │   Circuit    │        │
│  │  Collector   │  │  Assessor    │  │   Breaker    │        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            │                                     │
│                   ┌────────▼────────┐                           │
│                   │   Governance    │                           │
│                   │     Agent       │                           │
│                   └────────┬────────┘                           │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                │
│         │                  │                  │                 │
│    ┌────▼────┐      ┌─────▼──────┐     ┌────▼─────┐          │
│    │  REST   │      │ Prometheus │     │ Database │          │
│    │   API   │      │  Metrics   │     │ (SQLite) │          │
│    └─────────┘      └────────────┘     └──────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         │                    │                    │
    ┌────▼────┐         ┌─────▼──────┐     ┌─────▼──────┐
    │ Command │         │ Prometheus │     │  Grafana   │
    │ Service │         │   Server   │     │ Dashboard  │
    └─────────┘         └────────────┘     └────────────┘
```

## Database Schema

### Tables

- **governance_state** - Current autonomy phase and configuration (singleton)
- **metrics_snapshots** - Historical autonomy metrics
- **readiness_assessments** - Historical readiness reports
- **governance_reports** - Weekly governance cycle reports
- **circuit_breaker_rules** - Safety rule configurations
- **circuit_breaker_events** - Circuit breaker trigger history
- **scope_expansion_proposals** - Autonomy expansion proposals

### Default Circuit Breaker Rules

1. **High Error Rate** - Triggers on errorRate > 5% (5m window) → revert_to_l3
2. **Repeated Command Failures** - Triggers on 3+ failures (5m window) → pause_command_type
3. **Critical Incident** - Triggers on critical severity incident (1m window) → revert_to_l3
4. **High Rollback Rate** - Triggers on rollbackRate > 10% (15m window) → alert_only

## API Endpoints

### Health & Metrics
- `GET /health` - Liveness probe
- `GET /ready` - Readiness probe with dependency checks
- `GET /metrics` - Prometheus metrics endpoint

### Autonomy Metrics
- `GET /api/metrics/current?start=<date>&end=<date>` - Get metrics for time range
- `GET /api/metrics/latest` - Get latest metrics snapshot
- `GET /api/metrics/weekly` - Get last 7 days of metrics

### Readiness Assessment
- `GET /api/readiness/current` - Run readiness assessment
- `GET /api/readiness/latest` - Get latest assessment
- `GET /api/readiness/score` - Get just the overall score

### Circuit Breaker
- `GET /api/circuit-breaker/events` - Get recent events (limit=20)
- `GET /api/circuit-breaker/events/unresolved` - Get unresolved events
- `POST /api/circuit-breaker/events/:id/resolve` - Mark event as resolved
- `GET /api/circuit-breaker/rules` - Get all rules
- `GET /api/circuit-breaker/rules/enabled` - Get enabled rules
- `PATCH /api/circuit-breaker/rules/:name` - Update rule configuration

### Governance Workflow
- `POST /api/governance/run-cycle` - Run weekly governance cycle
- `GET /api/governance/reports` - Get governance reports (limit=10)
- `GET /api/governance/reports/latest` - Get latest report
- `GET /api/governance/reports/:id` - Get report by ID
- `GET /api/governance/state` - Get current governance state
- `GET /api/governance/proposals` - Get pending proposals
- `POST /api/governance/proposals/:id/approve` - Approve expansion proposal
- `POST /api/governance/proposals/:id/reject` - Reject expansion proposal

## 80-Point Readiness Checklist

### Technical (35 points)
**Command Performance** (15 points)
- 6+ months at current phase (5 pts, required)
- Success rate > 99.5% (5 pts, required)
- Approval rate > 80% (3 pts)
- Rollback rate < 2% (2 pts)

**Safety & Testing** (10 points)
- Eval coverage > 90% (5 pts, required)
- Zero critical incidents from autonomous actions (5 pts, required)

**Infrastructure** (10 points)
- Circuit breakers configured (3 pts, required)
- Monitoring in place (3 pts, required)
- Kill switch tested (2 pts)
- Chaos testing completed (2 pts)

### Process (25 points)
**Documentation** (10 points)
- Runbooks complete (5 pts, required)
- Incident playbooks (3 pts)
- Architecture docs updated (2 pts)

**Approval Workflow** (8 points)
- Clear escalation path (4 pts, required)
- Stakeholder sign-off (4 pts, required)

**Compliance** (7 points)
- Security review (3 pts)
- Audit trail implementation (2 pts)
- Rollback plan documented (2 pts)

### Organizational (20 points)
**Team Readiness** (12 points)
- On-call rotation trained (6 pts, required)
- Team consensus achieved (6 pts, required)

**Stakeholder Buy-in** (8 points)
- Product approval (4 pts, required)
- Ops approval (4 pts, required)

### Thresholds
- **Ready**: ≥ 76/80 points (95%) + all required items passed
- **Almost Ready**: 72-75 points (90-94%)
- **Needs Work**: < 72 points (< 90%)

## Weekly Governance Cycle

The governance agent runs a weekly cycle (typically Friday EOD):

1. **Collect Metrics** - Aggregate last 7 days of command execution data
2. **Assess Readiness** - Run 80-point checklist evaluation
3. **Check Circuit Breakers** - Review recent safety events
4. **Decide on Expansion** - Generate proposal if ready and safe
5. **Generate Report** - Create comprehensive governance report
6. **Update State** - Save report and update last report date

### Expansion Decision Logic

A scope expansion proposal is generated when:
- ✅ Readiness score ≥ 95% (76/80 points)
- ✅ All required checklist items passed
- ✅ No unresolved circuit breaker events
- ✅ No pending proposals awaiting approval
- ✅ Minimum stabilization period met (180+ days for initial expansion)

The proposal includes:
- **Target Phase**: Next phase in progression (e.g., L3 → L3+)
- **Commands to Whitelist**: Specific commands being automated
- **Validation Period**: Time to monitor new phase (14-60 days)
- **Key Achievements**: Evidence supporting expansion
- **Risk Assessment**: Low/Medium/High with mitigations
- **Required Approvals**: Stakeholders who must approve

## Configuration

### Environment Variables

```bash
# Server configuration
PORT=4007                          # Service port
HOST=0.0.0.0                       # Bind address
LOG_LEVEL=info                     # Logging level

# Database paths
GOVERNANCE_DB_PATH=./var/governance.db    # Governance database
COMMAND_DB_PATH=../command/var/command.db # Command service database (readonly)

# Circuit breaker configuration
CIRCUIT_BREAKER_CHECK_INTERVAL=60000      # Check interval (ms)
```

### Database Initialization

The governance database is automatically initialized on first startup with:
- Default L3 phase configuration
- 4 pre-configured circuit breaker rules
- Empty command whitelist

## Monitoring

### Prometheus Metrics

All governance metrics are exported with `simcorp_governance_*` prefix:

**Phase Metrics**
- `current_phase_info{phase}` - Current autonomy phase
- `days_since_phase_start` - Days at current phase

**Command Metrics**
- `command_success_rate` - Success rate (0-1)
- `command_approval_rate` - Approval rate (0-1)
- `command_error_rate` - Error rate (0-1)
- `command_rollback_rate` - Rollback rate (0-1)
- `commands_total{status}` - Command counts (succeeded, failed, rejected, rolledBack)

**Readiness Metrics**
- `readiness_score` - Overall readiness (0-1)
- `readiness_technical_score` - Technical points earned
- `readiness_process_score` - Process points earned
- `readiness_organizational_score` - Organizational points earned

**Circuit Breaker Metrics**
- `circuit_breaker_events_total{rule_name,action,alert_severity}` - Total events
- `circuit_breaker_events_unresolved` - Unresolved event count

**Safety Metrics**
- `incidents_total{severity}` - Incidents by severity
- `safety_constraint_violations_total` - Constraint violations
- `safety_emergency_aborts_total` - Emergency aborts

### Grafana Dashboard

A comprehensive Grafana dashboard is provided at:
- Location: `infra/monitoring/grafana/dashboards/autonomy-governance.json`
- URL: http://localhost:3000/d/autonomy-governance
- Auto-provisioned in Docker Compose setup

See `infra/monitoring/grafana/dashboards/README.md` for details.

### Recommended Alerts

```yaml
- alert: ReadinessScoreDropped
  expr: simcorp_governance_readiness_score < 0.90
  for: 5m

- alert: HighCommandErrorRate
  expr: simcorp_governance_command_error_rate > 0.05
  for: 5m

- alert: CircuitBreakerTriggered
  expr: simcorp_governance_circuit_breaker_events_unresolved > 0
  for: 1m

- alert: CriticalIncident
  expr: increase(simcorp_governance_incidents_total{severity="critical"}[5m]) > 0
```

## Development

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test suite
pnpm test metrics.test.ts
pnpm test circuit-breaker.test.ts
pnpm test governance-agent.test.ts
pnpm test readiness.test.ts
pnpm test api-integration.test.ts

# Watch mode
pnpm test:watch
```

### Local Development

```bash
# Start in development mode (with auto-reload)
pnpm dev

# Start in production mode
pnpm start
```

### Adding New Circuit Breaker Rules

1. Insert rule into database:
```sql
INSERT INTO circuit_breaker_rules (name, enabled, condition, window, action, alert_severity)
VALUES ('My Rule', 1, 'errorRate > 0.03', '10m', 'alert_only', 'medium');
```

2. Or use PATCH endpoint:
```bash
curl -X PATCH http://localhost:4007/api/circuit-breaker/rules/My%20Rule \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "condition": "errorRate > 0.03", "window": "10m"}'
```

### Adding Checklist Items

Edit the relevant checklist file in `src/readiness/checklists/`:
- `technical.ts` - Technical readiness items
- `process.ts` - Process readiness items
- `organizational.ts` - Organizational readiness items

Each item requires:
- `name` - Display name
- `weight` - Points (out of category total)
- `required` - Boolean (must pass for readiness)
- `status` - Evaluation function (returns boolean)

## Production Deployment

### Prerequisites

- Node.js 20+
- SQLite 3.35+
- Prometheus configured to scrape /metrics
- Grafana with Prometheus datasource

### Deployment Steps

1. **Build and start service**:
```bash
cd services/governance
pnpm install --prod
pnpm start
```

2. **Configure Prometheus scraping**:
```yaml
scrape_configs:
  - job_name: 'governance'
    static_configs:
      - targets: ['governance:4007']
    scrape_interval: 30s
```

3. **Import Grafana dashboard**:
- Dashboard JSON at `infra/monitoring/grafana/dashboards/autonomy-governance.json`
- Or use auto-provisioning with docker-compose

4. **Initialize governance state** (if starting fresh):
```bash
# State is automatically initialized on first startup with L3 phase
# Verify with:
curl http://localhost:4007/api/governance/state
```

5. **Set up weekly governance cycle** (cron or manual):
```bash
# Run weekly governance cycle (typically Friday EOD)
curl -X POST http://localhost:4007/api/governance/run-cycle
```

### Health Checks

```bash
# Liveness
curl http://localhost:4007/health

# Readiness
curl http://localhost:4007/ready

# Metrics
curl http://localhost:4007/metrics | grep simcorp_governance
```

## Troubleshooting

### Service won't start

- Check governance database exists: `ls services/governance/var/governance.db`
- Check command database path is correct: `COMMAND_DB_PATH` env var
- Check logs for initialization errors

### No metrics showing

- Verify metrics exporter started: Check logs for "Starting periodic governance metrics updates"
- Check database has data: `SELECT COUNT(*) FROM metrics_snapshots;`
- Verify Prometheus is scraping: Check Prometheus targets page

### Circuit breaker not triggering

- Check rules are enabled: `GET /api/circuit-breaker/rules/enabled`
- Verify circuit breaker is running: Check logs for "CircuitBreaker started"
- Test rule evaluation: Insert test metrics and verify condition logic

### Readiness assessment failing

- Check checklist item evaluation: `GET /api/readiness/current`
- Review blockers: Check `overall.blockers` array in response
- Verify metrics are being collected: `GET /api/metrics/latest`

## See Also

- [T-050 Implementation Plan](../../docs/T-050-PLAN.md)
- [Grafana Dashboard README](../../infra/monitoring/grafana/dashboards/README.md)
- [Operator Runbook](./RUNBOOK.md)
- [Circuit Breaker Documentation](./docs/CIRCUIT-BREAKER.md)
