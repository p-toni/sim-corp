# Autonomy Governance Dashboard

Comprehensive Grafana dashboard for monitoring the Sim-Corp autonomy governance system.

## Overview

The Autonomy Governance Dashboard provides real-time visualization of:

- **Current autonomy phase** (L3 → L3+ → L4 → L4+ → L5)
- **Readiness scores** (overall, technical, process, organizational)
- **Command execution metrics** (success rate, approval rate, error rate, rollback rate)
- **Circuit breaker events** (active alerts, historical trends)
- **Safety metrics** (incidents, constraint violations, emergency aborts)
- **Readiness blockers** (items preventing phase advancement)

## Dashboard Panels

### Top Row: Key Metrics
1. **Current Autonomy Phase** - Visual indicator of current phase with color coding
2. **Overall Readiness Score** - Gauge showing readiness percentage with thresholds
3. **Command Execution Rates** - Time series of success, approval, error, and rollback rates

### Middle Row: Monitoring
4. **Unresolved Circuit Breaker Events** - Count of active safety alerts
5. **Days at Current Phase** - Stability indicator
6. **Command Execution (Hourly)** - Bar chart of succeeded/failed/rejected commands

### Lower Rows: Deep Dive
7. **Readiness Scores by Category** - Breakdown of technical, process, and organizational scores
8. **Active Circuit Breaker Events** - Table of unresolved safety events
9. **Safety Metrics (Hourly)** - Incidents, constraint violations, and emergency aborts
10. **Readiness Blockers** - Table of items blocking phase advancement

## Annotations

The dashboard includes automatic annotations for:

- **Phase Changes** - Purple markers when autonomy phase changes
- **Circuit Breaker Events** - Red markers when circuit breakers trigger

## Thresholds

### Readiness Score
- 🔴 Red: < 80% - Significant issues
- 🟠 Orange: 80-90% - Improvement needed
- 🟡 Yellow: 90-95% - Almost ready
- 🟢 Green: ≥ 95% - Ready for expansion

### Command Success Rate
- Target: > 99.5%
- Warning: < 99.5%
- Critical: < 99%

## Data Sources

The dashboard queries Prometheus metrics from:

- **Governance Service**: `http://governance:4007/metrics`
- **Metrics**: All `simcorp_governance_*` metrics

## Installation

### Option 1: Auto-provisioning (Docker)

The dashboard is automatically loaded when using Docker Compose with Grafana provisioning:

```bash
docker-compose up -d grafana
```

The dashboard will be available at:
- URL: http://localhost:3000/d/autonomy-governance
- Folder: Sim-Corp

### Option 2: Manual Import

1. Open Grafana UI
2. Navigate to Dashboards → Import
3. Upload `autonomy-governance.json`
4. Select Prometheus datasource
5. Click Import

## Metrics Reference

### Phase Metrics
- `simcorp_governance_current_phase_info` - Current phase (0-4)
- `simcorp_governance_days_since_phase_start` - Days at current phase

### Command Metrics
- `simcorp_governance_command_success_rate` - Success rate (0-1)
- `simcorp_governance_command_approval_rate` - Approval rate (0-1)
- `simcorp_governance_command_error_rate` - Error rate (0-1)
- `simcorp_governance_command_rollback_rate` - Rollback rate (0-1)
- `simcorp_governance_commands_total{status}` - Command counts by status

### Readiness Metrics
- `simcorp_governance_readiness_score` - Overall readiness (0-1)
- `simcorp_governance_readiness_technical_score` - Technical points earned
- `simcorp_governance_readiness_process_score` - Process points earned
- `simcorp_governance_readiness_organizational_score` - Organizational points earned
- `simcorp_governance_readiness_*_max` - Maximum scores per category

### Circuit Breaker Metrics
- `simcorp_governance_circuit_breaker_events_total` - Total events
- `simcorp_governance_circuit_breaker_events_unresolved` - Unresolved events

### Safety Metrics
- `simcorp_governance_incidents_total{severity}` - Incidents by severity
- `simcorp_governance_safety_constraint_violations_total` - Constraint violations
- `simcorp_governance_safety_emergency_aborts_total` - Emergency aborts

## Alerts

Recommended Prometheus alerting rules:

```yaml
groups:
  - name: autonomy_governance
    rules:
      - alert: ReadinessScoreDropped
        expr: simcorp_governance_readiness_score < 0.90
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Readiness score dropped below 90%"

      - alert: HighCommandErrorRate
        expr: simcorp_governance_command_error_rate > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Command error rate exceeded 5%"

      - alert: CircuitBreakerTriggered
        expr: simcorp_governance_circuit_breaker_events_unresolved > 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Circuit breaker event(s) unresolved"

      - alert: CriticalIncident
        expr: increase(simcorp_governance_incidents_total{severity="critical"}[5m]) > 0
        labels:
          severity: critical
        annotations:
          summary: "Critical incident detected"
```

## Refresh Rate

Default: 30 seconds (configurable in dashboard settings)

## Time Range

Default: Last 6 hours (adjustable in time picker)

## Troubleshooting

### No data showing

1. Verify governance service is running:
   ```bash
   curl http://localhost:4007/health
   ```

2. Check Prometheus is scraping governance service:
   ```bash
   curl http://localhost:9090/api/v1/targets
   ```

3. Verify metrics endpoint returns data:
   ```bash
   curl http://localhost:4007/metrics | grep simcorp_governance
   ```

### Metrics not updating

- Check governance service logs for errors
- Verify metrics exporter is running (started on server boot)
- Ensure database has recent data (metrics snapshots, readiness assessments)

### Dashboard not appearing

- Check Grafana provisioning directory is mounted correctly
- Verify provisioning config points to correct dashboard JSON path
- Check Grafana logs for provisioning errors

## Development

To modify the dashboard:

1. Make changes in Grafana UI
2. Export updated JSON (Dashboard settings → JSON Model)
3. Replace `autonomy-governance.json` with exported JSON
4. Commit changes to version control

## See Also

- [Grafana Documentation](https://grafana.com/docs/)
- [Prometheus Query Language](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [T-050 Implementation Plan](../../../../docs/T-050-PLAN.md)
