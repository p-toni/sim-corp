# T-050: Autonomy Governance Agent & Circuit Breakers

**Status:** PLANNED
**Priority:** P1 (Critical for L4 transition)
**Estimate:** 4 weeks
**Dependencies:** T-044 (Resource Limits & Autoscaling)
**Blocks:** L4 autonomous operations expansion

## Overview

Build an Autonomy Governance Agent to oversee and manage the progression from L3 (human-in-the-loop) to L4 (high automation). This agent monitors command execution metrics, assesses readiness for autonomy expansion, proposes scope changes through the command proposal system, and implements circuit breakers to revert to L3 when anomalies are detected.

## Problem Statement

Currently, the decision to expand autonomous operations is manual and subjective. We need:
- Objective metrics to determine readiness for L4 expansion
- Automated monitoring of autonomous command execution
- Circuit breakers to prevent runaway autonomy
- Governance reports for stakeholder visibility
- Systematic approach to expanding autonomous scope

## Goals

1. **Objective Readiness Assessment**: Data-driven evaluation of readiness for L4
2. **Automated Scope Management**: Agent proposes command whitelist expansions
3. **Safety Circuit Breakers**: Auto-revert to L3 when anomalies detected
4. **Visibility**: Weekly governance reports for stakeholders
5. **Accountability**: All scope changes go through proposal/approval system

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────┐
│ services/governance/                                     │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ AutonomyGovernanceAgent                        │    │
│  │ - Weekly governance cycle                      │    │
│  │ - Metrics collection & analysis                │    │
│  │ - Readiness assessment                         │    │
│  │ - Proposal generation                          │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ CircuitBreaker                                  │    │
│  │ - Real-time command monitoring                 │    │
│  │ - Anomaly detection                            │    │
│  │ - Auto-revert to L3                            │    │
│  │ - Alert on-call                                │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ MetricsCollector                                │    │
│  │ - Command execution metrics                    │    │
│  │ - Incident tracking                            │    │
│  │ - Eval coverage metrics                        │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ ReadinessAssessor                               │    │
│  │ - Technical readiness checklist                │    │
│  │ - Process readiness checklist                  │    │
│  │ - Organizational readiness checklist           │    │
│  │ - Overall score calculation                    │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

```
Command Execution → Metrics DB → MetricsCollector → ReadinessAssessor
                                         ↓
                              AutonomyGovernanceAgent
                                    ↓          ↓
                          Report Generation  Proposal Creation
                                    ↓          ↓
                             Stakeholders  Command Service
                                              ↓
                                    Human Approval/Rejection
                                              ↓
                                   Whitelist Update
```

## Core Interfaces

### Autonomy Metrics

```typescript
interface AutonomyMetrics {
  period: {
    start: Date;
    end: Date;
  };

  commands: {
    total: number;
    proposed: number;
    approved: number;
    rejected: number;
    succeeded: number;
    failed: number;
    rolledBack: number;
  };

  rates: {
    successRate: number;      // succeeded / (succeeded + failed)
    approvalRate: number;     // approved / proposed
    rollbackRate: number;     // rolledBack / succeeded
    errorRate: number;        // failed / total
  };

  incidents: {
    total: number;
    critical: number;
    fromAutonomousActions: number;
  };

  safety: {
    constraintViolations: number;
    emergencyAborts: number;
    safetyGateTriggers: number;
  };
}
```

### Readiness Report

```typescript
interface ReadinessReport {
  timestamp: Date;
  currentPhase: 'L3' | 'L3+' | 'L4' | 'L4+';
  daysSincePhaseStart: number;

  overall: {
    score: number;        // 0-1
    ready: boolean;       // true if score > 0.95
    blockers: string[];
  };

  technical: ChecklistStatus;
  process: ChecklistStatus;
  organizational: ChecklistStatus;

  recommendations: Recommendation[];
  nextActions: Action[];
}

interface ChecklistStatus {
  score: number;          // 0-1
  items: ChecklistItem[];
}

interface ChecklistItem {
  name: string;
  required: boolean;
  status: boolean;
  details?: string;
}

interface Recommendation {
  type: 'expand_scope' | 'maintain' | 'rollback' | 'investigate';
  priority: 'high' | 'medium' | 'low';
  rationale: string;
  actions: string[];
}
```

### Circuit Breaker Rules

```typescript
interface CircuitBreakerRule {
  name: string;
  enabled: boolean;
  condition: string;      // e.g., "errorRate > 0.05"
  window: string;         // e.g., "5m"
  action: 'revert_to_l3' | 'pause_command_type' | 'alert_only';
  alertSeverity: 'critical' | 'high' | 'medium' | 'low';
}

const defaultRules: CircuitBreakerRule[] = [
  {
    name: 'High Error Rate',
    enabled: true,
    condition: 'errorRate > 0.05',  // >5% errors
    window: '5m',
    action: 'revert_to_l3',
    alertSeverity: 'critical',
  },
  {
    name: 'Repeated Command Failures',
    enabled: true,
    condition: 'commandType.failures >= 3',  // Same command fails 3+ times
    window: '5m',
    action: 'pause_command_type',
    alertSeverity: 'high',
  },
  {
    name: 'Critical Incident Detected',
    enabled: true,
    condition: 'incident.severity === "critical"',
    window: '1m',
    action: 'revert_to_l3',
    alertSeverity: 'critical',
  },
  {
    name: 'High Rollback Rate',
    enabled: true,
    condition: 'rollbackRate > 0.1',  // >10% rollbacks
    window: '15m',
    action: 'alert_only',
    alertSeverity: 'medium',
  },
];
```

### Scope Expansion Proposal

```typescript
interface ScopeExpansionProposal {
  proposalId: string;
  timestamp: Date;
  proposedBy: 'autonomy-governance-agent';

  expansion: {
    currentPhase: string;
    targetPhase: string;
    commandsToWhitelist: string[];
    validationPeriod: number;  // days
  };

  rationale: {
    metrics: AutonomyMetrics;
    readiness: ReadinessReport;
    keyAchievements: string[];
  };

  riskAssessment: {
    level: 'low' | 'medium' | 'high';
    mitigations: string[];
    rollbackPlan: string;
  };

  requiredApprovals: string[];  // e.g., ['tech-lead', 'ops-lead']
}
```

## Implementation Plan

### Week 1: Foundation & Metrics Collection

**Deliverables:**
- Create `services/governance/` service structure
- Implement `MetricsCollector` class
- Database schema for autonomy metrics
- Integration with command service for metric collection
- Basic metrics aggregation queries

**Files:**
```
services/governance/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── metrics/
│   │   ├── collector.ts
│   │   ├── aggregator.ts
│   │   └── schemas.ts
│   ├── db/
│   │   ├── schema.sql
│   │   └── repo.ts
│   └── routes/
│       └── metrics.ts
└── tests/
    └── metrics.test.ts
```

**Key APIs:**
```typescript
class MetricsCollector {
  // Collect command metrics
  async collectCommandMetrics(timeRange: TimeRange): Promise<CommandMetrics>;

  // Collect incident metrics
  async collectIncidentMetrics(timeRange: TimeRange): Promise<IncidentMetrics>;

  // Collect eval coverage
  async collectEvalCoverage(): Promise<EvalCoverageMetrics>;

  // Aggregate all metrics
  async collectAll(timeRange: TimeRange): Promise<AutonomyMetrics>;
}
```

### Week 2: Readiness Assessment

**Deliverables:**
- Implement `ReadinessAssessor` class
- Technical readiness checklist
- Process readiness checklist
- Organizational readiness checklist
- Overall scoring algorithm
- Recommendation generation

**Files:**
```
src/
├── readiness/
│   ├── assessor.ts
│   ├── checklists/
│   │   ├── technical.ts
│   │   ├── process.ts
│   │   └── organizational.ts
│   ├── scoring.ts
│   └── recommendations.ts
└── routes/
    └── readiness.ts
```

**Key APIs:**
```typescript
class ReadinessAssessor {
  async assess(): Promise<ReadinessReport>;

  private async assessTechnical(): Promise<ChecklistStatus>;
  private async assessProcess(): Promise<ChecklistStatus>;
  private async assessOrganizational(): Promise<ChecklistStatus>;

  private calculateOverallScore(statuses: ChecklistStatus[]): number;
  private generateRecommendations(report: ReadinessReport): Recommendation[];
}
```

### Week 3: Governance Agent & Circuit Breakers

**Deliverables:**
- Implement `AutonomyGovernanceAgent` class
- Weekly governance cycle workflow
- Proposal generation for scope expansion
- Governance report templates
- `CircuitBreaker` implementation
- Real-time command monitoring
- Alert integration

**Files:**
```
src/
├── agent/
│   ├── governance-agent.ts
│   ├── workflow.ts
│   └── proposal-generator.ts
├── circuit-breaker/
│   ├── breaker.ts
│   ├── rules.ts
│   ├── monitor.ts
│   └── alerts.ts
├── reports/
│   ├── generator.ts
│   └── templates/
│       ├── weekly-report.md
│       └── incident-report.md
└── routes/
    ├── governance.ts
    └── circuit-breaker.ts
```

**Key APIs:**
```typescript
class AutonomyGovernanceAgent {
  // Main weekly cycle
  async runWeeklyCycle(): Promise<GovernanceReport>;

  // Collect and analyze
  private async collectMetrics(): Promise<AutonomyMetrics>;
  private async assessReadiness(): Promise<ReadinessReport>;

  // Generate outputs
  private async generateReport(): Promise<GovernanceReport>;
  private async createExpansionProposal(): Promise<ScopeExpansionProposal>;

  // Decision logic
  private shouldProposeExpansion(): boolean;
  private selectCommandsForWhitelist(): string[];
}

class CircuitBreaker {
  async monitor(): Promise<void>;

  private async analyze(window: SlidingWindow): Promise<BreakDecision>;
  private async break(decision: BreakDecision): Promise<void>;
  private async revertToL3(): Promise<void>;
  private async alertOnCall(alert: Alert): Promise<void>;
}
```

### Week 4: Dashboard, Testing & Documentation

**Deliverables:**
- Governance dashboard UI
- Comprehensive test suite
- Integration tests
- Documentation
- Deployment guide
- Runbook for on-call

**Files:**
```
apps/governance-dashboard/
├── src/
│   ├── components/
│   │   ├── MetricsChart.tsx
│   │   ├── ReadinessChecklist.tsx
│   │   ├── CommandWhitelist.tsx
│   │   └── CircuitBreakerStatus.tsx
│   └── pages/
│       ├── Dashboard.tsx
│       ├── Reports.tsx
│       └── Settings.tsx
tests/
├── integration/
│   ├── governance-cycle.test.ts
│   ├── circuit-breaker.test.ts
│   └── proposal-flow.test.ts
docs/
├── ops/
│   └── autonomy-governance.md
└── runbooks/
    └── circuit-breaker-triggered.md
```

## Readiness Checklists

### Technical Readiness (35 points)

```typescript
const technicalChecklist: ChecklistItem[] = [
  // Command Performance (15 points)
  { name: '6+ months running at L3', weight: 5, required: true },
  { name: 'Command success rate >99.5%', weight: 5, required: true },
  { name: 'Command approval rate >80%', weight: 3, required: false },
  { name: 'Rollback rate <2%', weight: 2, required: false },

  // Safety & Testing (10 points)
  { name: 'Eval coverage >90%', weight: 5, required: true },
  { name: 'Zero critical incidents from commands', weight: 5, required: true },

  // Infrastructure (10 points)
  { name: 'Circuit breakers implemented', weight: 3, required: true },
  { name: 'Real-time monitoring operational', weight: 3, required: true },
  { name: 'Kill switch tested', weight: 2, required: true },
  { name: 'Chaos engineering tests passing', weight: 2, required: false },
];
```

### Process Readiness (25 points)

```typescript
const processChecklist: ChecklistItem[] = [
  // Documentation (10 points)
  { name: 'Incident response playbook complete', weight: 5, required: true },
  { name: 'Runbooks for autonomous actions', weight: 3, required: true },
  { name: 'Accountability framework documented', weight: 2, required: true },

  // Approvals (10 points)
  { name: 'Approval workflow defined', weight: 5, required: true },
  { name: 'Escalation paths established', weight: 3, required: true },
  { name: 'Rollback procedures tested', weight: 2, required: true },

  // Compliance (5 points)
  { name: 'Compliance requirements validated', weight: 3, required: false },
  { name: 'Audit trail comprehensive', weight: 2, required: true },
];
```

### Organizational Readiness (20 points)

```typescript
const organizationalChecklist: ChecklistItem[] = [
  // Team (10 points)
  { name: 'Team trained on monitoring', weight: 5, required: true },
  { name: 'On-call rotation established', weight: 3, required: true },
  { name: '24/7 coverage available', weight: 2, required: false },

  // Stakeholder (10 points)
  { name: 'Leadership approval obtained', weight: 5, required: true },
  { name: 'Customer communication plan ready', weight: 3, required: false },
  { name: 'Design partner validation complete', weight: 2, required: true },
];
```

**Scoring:**
- Technical: 35 points max
- Process: 25 points max
- Organizational: 20 points max
- **Total: 80 points max**
- **Threshold for L4: 76 points (95%)**

## Testing Strategy

### Unit Tests

```typescript
describe('MetricsCollector', () => {
  it('should collect command metrics for time range');
  it('should calculate success rate correctly');
  it('should detect incident attribution');
});

describe('ReadinessAssessor', () => {
  it('should assess technical readiness');
  it('should calculate overall score');
  it('should generate recommendations');
  it('should identify blockers');
});

describe('CircuitBreaker', () => {
  it('should detect high error rate');
  it('should trigger on repeated failures');
  it('should revert to L3');
  it('should alert on-call');
});

describe('AutonomyGovernanceAgent', () => {
  it('should run weekly cycle');
  it('should propose scope expansion when ready');
  it('should not propose when not ready');
  it('should generate governance report');
});
```

### Integration Tests

```typescript
describe('Governance Workflow (End-to-End)', () => {
  it('should complete full weekly governance cycle', async () => {
    // 1. Agent collects metrics
    // 2. Assesses readiness
    // 3. Generates report
    // 4. Proposes expansion if ready
    // 5. Creates command proposal
    // 6. Human approves
    // 7. Whitelist updated
  });

  it('should trigger circuit breaker on anomaly', async () => {
    // 1. Simulate command failures
    // 2. Circuit breaker detects pattern
    // 3. Reverts to L3
    // 4. Alerts on-call
    // 5. Metrics reflected in dashboard
  });
});
```

## Rollout Plan

### Phase 1: Metrics Collection (Week 1-2)
- Deploy governance service
- Start collecting metrics (read-only)
- No decision-making yet
- Manual review of metrics

### Phase 2: Readiness Monitoring (Week 3-4)
- Enable readiness assessment
- Generate weekly reports
- Share with stakeholders
- No automated actions yet

### Phase 3: Governance Agent (Week 5-6)
- Enable agent workflow
- Agent generates proposals (humans review)
- Manual approval required
- Monitor agent recommendations

### Phase 4: Circuit Breakers (Week 7-8)
- Enable circuit breakers in "alert-only" mode
- Tune thresholds based on data
- Test revert-to-L3 functionality
- Full production deployment

## Success Criteria

- [ ] Metrics collected from all command executions
- [ ] Weekly governance reports generated automatically
- [ ] Readiness assessment produces actionable recommendations
- [ ] Circuit breakers detect and respond to anomalies
- [ ] Agent proposes scope expansions through proposal system
- [ ] Dashboard provides real-time visibility
- [ ] All tests passing (unit, integration, E2E)
- [ ] Documentation complete
- [ ] Runbooks validated

## Dependencies

**Required:**
- T-044: Resource Limits & Autoscaling (monitoring infrastructure)
- Command service with proposal system (M4 complete)
- Metrics infrastructure (T-037 complete)

**Optional:**
- Incident tracking system (may need separate task)
- Enhanced alerting (PagerDuty/OpsGenie integration)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Metrics collection overhead | Performance | Async collection, batch processing |
| False positive circuit breakers | Unnecessary L3 reversion | Tunable thresholds, human override |
| Agent proposes premature expansion | Safety risk | Conservative scoring, human approval required |
| Dashboard complexity | Low adoption | Iterative design, user feedback |

## Open Questions

1. **Incident Attribution:** How do we definitively attribute incidents to autonomous actions?
   - Proposed: Correlation based on timing + affected resources + command audit log

2. **Approval Authority:** Who can approve scope expansion proposals?
   - Proposed: Tech lead + ops lead both required for L3→L4 expansion

3. **Emergency Procedures:** What happens if circuit breaker system itself fails?
   - Proposed: Manual kill switch always available, fallback to L3 if governance service unreachable

4. **Metrics Retention:** How long to keep detailed metrics?
   - Proposed: Raw data 90 days, aggregated data 2 years

## Future Enhancements

- **ML-based Anomaly Detection:** Use ML models to detect subtle anomalies
- **Predictive Readiness:** Predict when L4 readiness will be achieved
- **Multi-dimensional Rollout:** Different autonomy levels per command type
- **A/B Testing for Commands:** Test new autonomous commands with partial traffic
- **Automated Incident Attribution:** AI-powered root cause analysis
