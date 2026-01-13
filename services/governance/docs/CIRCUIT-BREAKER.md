# Circuit Breaker System

The Circuit Breaker is a safety mechanism that monitors autonomy metrics in real-time and automatically intervenes when safety thresholds are violated.

## Overview

The Circuit Breaker implements the **fail-safe** principle: when in doubt, revert to human control (L3). It continuously evaluates a set of configurable rules against current metrics and takes automated actions when rules trigger.

### Design Principles

1. **Safety First**: Better to over-trigger than miss a critical incident
2. **Fast Response**: Evaluation cycle runs every 60 seconds (configurable)
3. **Automatic Action**: No human intervention required for safety reversion
4. **Transparency**: All events logged and visible in Grafana
5. **Tunability**: Rules can be adjusted based on operational experience

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Circuit Breaker                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌──────────┐   Every 60s    ┌──────────────┐           │
│   │  Timer   │─────────────────▶│ check()      │           │
│   └──────────┘                 └──────┬───────┘           │
│                                       │                     │
│                          ┌────────────▼────────────┐       │
│                          │  Load Enabled Rules    │       │
│                          └────────────┬────────────┘       │
│                                       │                     │
│                          ┌────────────▼────────────┐       │
│                          │  Collect Latest        │       │
│                          │  Metrics (30 days)     │       │
│                          └────────────┬────────────┘       │
│                                       │                     │
│                          ┌────────────▼────────────┐       │
│                          │  For Each Rule:        │       │
│                          │  evaluateRule()        │       │
│                          └────────────┬────────────┘       │
│                                       │                     │
│                          ┌────────────▼────────────┐       │
│                          │  Rule Triggered?       │       │
│                          └────────────┬────────────┘       │
│                                  Yes  │  No               │
│                          ┌────────────▼────────────┐       │
│                          │  triggerBreaker()      │       │
│                          │  - Create event        │       │
│                          │  - Execute action      │       │
│                          │  - Alert on-call       │       │
│                          └─────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Rule Configuration

### Rule Schema

```typescript
interface CircuitBreakerRule {
  name: string;                      // Unique rule identifier
  enabled: boolean;                  // Rule active/inactive
  condition: string;                 // Evaluation condition
  window: string;                    // Time window (e.g., "5m", "1h")
  action: 'revert_to_l3'            // Action to take
        | 'pause_command_type'
        | 'alert_only';
  alertSeverity: 'critical'          // Alert severity
               | 'high'
               | 'medium'
               | 'low';
}
```

### Condition Syntax

Conditions are string-based expressions evaluated against `AutonomyMetrics`:

**Supported Operators**:
- `>` - Greater than
- `>=` - Greater than or equal
- `<` - Less than
- `<=` - Less than or equal
- `===` - Equal (for strings)

**Supported Metrics**:
- `errorRate` - Command error rate (0-1)
- `successRate` - Command success rate (0-1)
- `rollbackRate` - Command rollback rate (0-1)
- `approvalRate` - Command approval rate (0-1)
- `incidents.critical` - Count of critical incidents
- `incident.severity` - Incident severity (for severity-based rules)
- `commandType.failures` - Command type failure count
- `constraintViolations` - Safety constraint violations
- `emergencyAborts` - Emergency abort count

**Example Conditions**:
```
errorRate > 0.05                           # Error rate exceeds 5%
successRate < 0.995                        # Success rate below 99.5%
rollbackRate >= 0.1                        # Rollback rate 10% or higher
incident.severity === "critical"           # Critical incident detected
commandType.failures >= 3                  # 3+ command failures
constraintViolations > 10                  # More than 10 violations
```

### Time Windows

Time windows specify the period over which metrics are evaluated:

```
5s    - 5 seconds
30s   - 30 seconds
1m    - 1 minute
5m    - 5 minutes
15m   - 15 minutes
1h    - 1 hour
24h   - 24 hours
1d    - 1 day
7d    - 7 days
```

Shorter windows = more sensitive to spikes
Longer windows = more stable, less noisy

### Actions

#### 1. `revert_to_l3` (Most Severe)

**When to use**: Critical safety violations, high risk scenarios

**What it does**:
1. Immediately sets autonomy phase to L3
2. Clears command whitelist (all commands require approval)
3. Creates circuit breaker event
4. Sends critical alert to on-call
5. Logs incident for investigation

**Example**:
```json
{
  "name": "Critical Error Rate",
  "enabled": true,
  "condition": "errorRate > 0.1",
  "window": "5m",
  "action": "revert_to_l3",
  "alertSeverity": "critical"
}
```

**Recovery**: Manual investigation and phase re-approval required

#### 2. `pause_command_type` (Moderate)

**When to use**: Specific command type failing repeatedly

**What it does**:
1. Pauses automated execution of failing command type
2. Creates circuit breaker event
3. Sends high-priority alert
4. Allows other commands to continue

**Example**:
```json
{
  "name": "Repeated SET_DRUM Failures",
  "enabled": true,
  "condition": "commandType.failures >= 3",
  "window": "5m",
  "action": "pause_command_type",
  "alertSeverity": "high"
}
```

**Recovery**: Fix command logic, validate, resume command type

**Note**: Currently pauses all commands. Per-command-type pausing requires enhancement.

#### 3. `alert_only` (Least Severe)

**When to use**: Warning conditions, trend monitoring

**What it does**:
1. Creates circuit breaker event (for tracking)
2. Sends alert based on severity
3. No automated intervention
4. Continues normal operation

**Example**:
```json
{
  "name": "Elevated Rollback Rate",
  "enabled": true,
  "condition": "rollbackRate > 0.05",
  "window": "15m",
  "action": "alert_only",
  "alertSeverity": "medium"
}
```

**Recovery**: Investigation and manual intervention if needed

### Alert Severity

Determines routing and urgency of alerts:

| Severity  | Response Time | Notification     | Grafana Color |
|-----------|---------------|------------------|---------------|
| Critical  | 5 minutes     | Page on-call     | Red           |
| High      | 15 minutes    | Slack + Email    | Orange        |
| Medium    | 1 hour        | Slack            | Yellow        |
| Low       | Next day      | Email            | Blue          |

## Default Rules

### 1. High Error Rate

```json
{
  "name": "High Error Rate",
  "enabled": true,
  "condition": "errorRate > 0.05",
  "window": "5m",
  "action": "revert_to_l3",
  "alertSeverity": "critical"
}
```

**Rationale**: Error rate > 5% indicates systemic issues. Immediate reversion to human control protects production.

**Threshold Justification**:
- Target success rate: 99.5%
- 5% errors = 95% success (significantly below target)
- 5-minute window balances sensitivity with noise reduction

**False Positive Risk**: Low - sustained 5% error rate is genuine issue

### 2. Repeated Command Failures

```json
{
  "name": "Repeated Command Failures",
  "enabled": true,
  "condition": "commandType.failures >= 3",
  "window": "5m",
  "action": "pause_command_type",
  "alertSeverity": "high"
}
```

**Rationale**: 3+ failures of same command type in 5 minutes suggests command-specific bug.

**Threshold Justification**:
- 1 failure: Could be transient
- 2 failures: Concerning but investigate
- 3+ failures: Clear pattern, pause command type

**False Positive Risk**: Medium - could trigger on environmental issues

### 3. Critical Incident Detected

```json
{
  "name": "Critical Incident Detected",
  "enabled": true,
  "condition": "incident.severity === \"critical\"",
  "window": "1m",
  "action": "revert_to_l3",
  "alertSeverity": "critical"
}
```

**Rationale**: Any critical incident warrants immediate reversion.

**Threshold Justification**:
- Critical = production impact or safety risk
- 1-minute window for immediate response
- Zero tolerance policy for critical incidents

**False Positive Risk**: Very Low - critical incidents are manually classified

### 4. High Rollback Rate

```json
{
  "name": "High Rollback Rate",
  "enabled": true,
  "condition": "rollbackRate > 0.1",
  "window": "15m",
  "action": "alert_only",
  "alertSeverity": "medium"
}
```

**Rationale**: Rollback rate > 10% indicates automation making poor decisions.

**Threshold Justification**:
- Target rollback rate: < 2%
- 10% = 5x normal rate
- 15-minute window smooths out single-batch rollbacks

**False Positive Risk**: Medium - batch operations could trigger

## Rule Evaluation Logic

### Evaluation Flow

```typescript
function evaluateRule(rule: CircuitBreakerRule, metrics: AutonomyMetrics): boolean {
  // 1. Check if rule is enabled
  if (!rule.enabled) {
    return false;
  }

  // 2. Parse and evaluate condition
  const result = evaluateCondition(rule.condition, metrics);

  // 3. Return result
  return result;
}
```

### Condition Parsing

The condition parser uses string matching for safety and simplicity:

```typescript
function evaluateCondition(condition: string, metrics: AutonomyMetrics): boolean {
  // Example: "errorRate > 0.05"

  // Check for >= before > to avoid substring match
  if (condition.includes('errorRate >=')) {
    const threshold = parseFloat(condition.split('>=')[1].trim());
    return metrics.rates.errorRate >= threshold;
  }

  if (condition.includes('errorRate >')) {
    const threshold = parseFloat(condition.split('>')[1].trim());
    return metrics.rates.errorRate > threshold;
  }

  // ... other condition types ...

  return false; // Default: don't trigger
}
```

**Design Decision**: String parsing instead of `eval()` for security

**Trade-offs**:
- ✅ No code injection risk
- ✅ Simple and auditable
- ✅ Fast evaluation
- ❌ Limited expression complexity
- ❌ No boolean logic (AND/OR)

### Metrics Window

Rules specify a time window, but current implementation uses latest snapshot:

**Current**: Rule window is informational, evaluation uses latest metrics
**Future**: Implement sliding window evaluation over specified period

**Example**:
```typescript
// Current (simplified)
const metrics = metricsRepo.getLatest();
const triggered = evaluateRule(rule, metrics);

// Future (time-aware)
const metrics = metricsRepo.getInWindow(rule.window);
const triggered = evaluateRule(rule, metrics);
```

## Event Lifecycle

### Event Creation

When a rule triggers:

```typescript
const event: CircuitBreakerEvent = {
  id: randomUUID(),
  timestamp: new Date(),
  rule: {
    name: rule.name,
    condition: rule.condition,
    window: rule.window,
    action: rule.action,
    alertSeverity: rule.alertSeverity,
  },
  metrics: currentMetrics,
  action: rule.action,
  details: `Rule "${rule.name}" triggered: ${rule.condition}`,
  resolved: false,
};

eventsRepo.save(event);
```

### Event Actions

After event creation, action is executed:

```typescript
switch (event.action) {
  case 'revert_to_l3':
    await this.revertToL3(event);
    break;
  case 'pause_command_type':
    await this.pauseCommandType(event);
    break;
  case 'alert_only':
    // No automated action
    break;
}

// Always send alert
await this.alertOnCall(event);
```

### Event Resolution

Events remain unresolved until manually marked resolved:

```bash
curl -X POST http://localhost:4007/api/circuit-breaker/events/{id}/resolve
```

**Resolution Criteria**:
- Root cause identified
- Fix implemented and validated
- System returned to normal operation
- Documentation updated

**Tracking**: Unresolved events are prominently displayed in Grafana dashboard

## Best Practices

### Rule Design

1. **Start Conservative**
   - Begin with stricter thresholds
   - Relax based on false positive rate
   - Aim for < 5% false positive rate

2. **Use Appropriate Windows**
   - Critical conditions: Short windows (1m-5m)
   - Warning conditions: Medium windows (15m-1h)
   - Trend monitoring: Long windows (1h-24h)

3. **Match Action to Severity**
   - Critical safety issues → `revert_to_l3`
   - Specific failures → `pause_command_type`
   - Warning indicators → `alert_only`

4. **Document Rationale**
   - Why this threshold?
   - What's the false positive risk?
   - What should operators do when triggered?

### Operational Guidelines

1. **Monitor Rule Effectiveness**
   - Track trigger frequency
   - Calculate false positive rate
   - Adjust thresholds quarterly

2. **Respond to Events Promptly**
   - Critical: < 5 minutes
   - High: < 15 minutes
   - Medium: < 1 hour
   - Low: Next business day

3. **Always Resolve Events**
   - Don't leave events in unresolved state
   - Document resolution in event
   - Update runbook if new scenario

4. **Review Rules Monthly**
   - Are rules still relevant?
   - Do thresholds need adjustment?
   - Should new rules be added?

### Adding New Rules

1. **Identify Risk**
   - What failure mode are you protecting against?
   - What's the impact if not caught?
   - How quickly must we respond?

2. **Define Threshold**
   - What metric indicates the problem?
   - What value is definitely bad?
   - What window makes sense?

3. **Choose Action**
   - How severe is this risk?
   - Can we isolate to one command type?
   - Or do we need full reversion?

4. **Test Before Enabling**
   - Insert test data
   - Verify rule triggers correctly
   - Confirm action executes as expected

5. **Monitor for Tuning**
   - Track triggers for first week
   - Adjust if too many false positives
   - Document final threshold decision

## Future Enhancements

### Planned Improvements

1. **Time-Window Evaluation**
   - Currently: Uses latest snapshot
   - Future: Evaluate metrics over specified window
   - Benefit: More accurate trend detection

2. **Per-Command-Type Pausing**
   - Currently: `pause_command_type` not fully implemented
   - Future: Pause specific command types (e.g., only SET_DRUM)
   - Benefit: More granular control

3. **Complex Conditions**
   - Currently: Single condition per rule
   - Future: Boolean logic (AND/OR)
   - Example: `errorRate > 0.05 AND rollbackRate > 0.1`

4. **Automatic Rule Tuning**
   - Currently: Manual threshold adjustment
   - Future: ML-based threshold recommendations
   - Benefit: Optimal thresholds based on historical data

5. **Graduated Response**
   - Currently: Single action per rule
   - Future: Escalating actions over time
   - Example: Alert → Pause → Revert

6. **Circuit Breaker Recovery**
   - Currently: Manual recovery required
   - Future: Automatic recovery after stabilization
   - Benefit: Faster return to normal operation

## Troubleshooting

### Rule Not Triggering

**Check**:
1. Is rule enabled? `curl .../circuit-breaker/rules | jq '.[] | select(.name=="...")'`
2. Is condition syntax correct? Test with known-bad metrics
3. Is window too long? Condition may not persist long enough
4. Are metrics being collected? `curl .../metrics/latest`

### Too Many False Positives

**Solutions**:
1. Increase threshold (make less sensitive)
2. Increase window (reduce noise)
3. Change action to `alert_only` temporarily
4. Review if rule is still relevant

### Action Not Executing

**Check**:
1. Check service logs for errors
2. Verify governance state repo accessible
3. Confirm action logic in `breaker.ts:executeAction()`
4. Test action manually via API

### Events Not Resolving

**Check**:
1. Confirm API endpoint working: `curl -X POST .../events/{id}/resolve`
2. Check event ID is correct
3. Verify event exists in database
4. Check for database permission issues

## References

- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Operator Runbook](../RUNBOOK.md)
- [Grafana Dashboard](../../../infra/monitoring/grafana/dashboards/README.md)
- [API Documentation](../README.md#api-endpoints)
