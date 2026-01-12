import { z } from "zod";

export const GovernanceDecisionSchema = z.object({
  action: z.enum(["ALLOW", "QUARANTINE", "BLOCK", "RETRY_LATER"]),
  confidence: z.enum(["LOW", "MED", "HIGH"]).default("LOW"),
  reasons: z
    .array(
      z.object({
        code: z.string(),
        message: z.string(),
        details: z.record(z.unknown()).default({})
      })
    )
    .default([]),
  decidedAt: z.string(),
  decidedBy: z.enum(["KERNEL_GOVERNOR", "HUMAN"]).default("KERNEL_GOVERNOR")
});

export type GovernanceDecision = z.infer<typeof GovernanceDecisionSchema>;

/**
 * T-050: Autonomy Governance Schemas
 *
 * Schemas for autonomy governance, readiness assessment, and circuit breakers.
 */

/**
 * Time range for metrics collection
 */
export const TimeRangeSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
});

export type TimeRange = z.infer<typeof TimeRangeSchema>;

/**
 * Autonomy metrics for a given time period
 */
export const AutonomyMetricsSchema = z.object({
  period: TimeRangeSchema,

  commands: z.object({
    total: z.number().int().nonnegative(),
    proposed: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    rolledBack: z.number().int().nonnegative(),
  }),

  rates: z.object({
    successRate: z.number().min(0).max(1),
    approvalRate: z.number().min(0).max(1),
    rollbackRate: z.number().min(0).max(1),
    errorRate: z.number().min(0).max(1),
  }),

  incidents: z.object({
    total: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative(),
    fromAutonomousActions: z.number().int().nonnegative(),
  }),

  safety: z.object({
    constraintViolations: z.number().int().nonnegative(),
    emergencyAborts: z.number().int().nonnegative(),
    safetyGateTriggers: z.number().int().nonnegative(),
  }),
});

export type AutonomyMetrics = z.infer<typeof AutonomyMetricsSchema>;

/**
 * Checklist item for readiness assessment
 */
export const ChecklistItemSchema = z.object({
  name: z.string(),
  weight: z.number().positive(),
  required: z.boolean(),
  status: z.boolean(),
  details: z.string().optional(),
});

export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

/**
 * Status of a checklist category (technical, process, organizational)
 */
export const ChecklistStatusSchema = z.object({
  score: z.number().min(0).max(1),
  maxScore: z.number().positive(),
  items: z.array(ChecklistItemSchema),
});

export type ChecklistStatus = z.infer<typeof ChecklistStatusSchema>;

/**
 * Recommendation type
 */
export const RecommendationTypeSchema = z.enum([
  'expand_scope',
  'maintain',
  'rollback',
  'investigate',
]);

export type RecommendationType = z.infer<typeof RecommendationTypeSchema>;

/**
 * Recommendation for next actions
 */
export const RecommendationSchema = z.object({
  type: RecommendationTypeSchema,
  priority: z.enum(['high', 'medium', 'low']),
  rationale: z.string(),
  actions: z.array(z.string()),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

/**
 * Action item for governance
 */
export const ActionSchema = z.object({
  description: z.string(),
  owner: z.string().optional(),
  dueDate: z.coerce.date().optional(),
  completed: z.boolean().default(false),
});

export type Action = z.infer<typeof ActionSchema>;

/**
 * Autonomy phase
 */
export const AutonomyPhaseSchema = z.enum(['L3', 'L3+', 'L4', 'L4+', 'L5']);

export type AutonomyPhase = z.infer<typeof AutonomyPhaseSchema>;

/**
 * Readiness assessment report
 */
export const ReadinessReportSchema = z.object({
  timestamp: z.coerce.date(),
  currentPhase: AutonomyPhaseSchema,
  daysSincePhaseStart: z.number().int().nonnegative(),

  overall: z.object({
    score: z.number().min(0).max(1),
    ready: z.boolean(),
    blockers: z.array(z.string()),
  }),

  technical: ChecklistStatusSchema,
  process: ChecklistStatusSchema,
  organizational: ChecklistStatusSchema,

  recommendations: z.array(RecommendationSchema),
  nextActions: z.array(ActionSchema),
});

export type ReadinessReport = z.infer<typeof ReadinessReportSchema>;

/**
 * Circuit breaker rule action
 */
export const CircuitBreakerActionSchema = z.enum([
  'revert_to_l3',
  'pause_command_type',
  'alert_only',
]);

export type CircuitBreakerAction = z.infer<typeof CircuitBreakerActionSchema>;

/**
 * Circuit breaker rule
 */
export const CircuitBreakerRuleSchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
  condition: z.string(),
  window: z.string(),
  action: CircuitBreakerActionSchema,
  alertSeverity: z.enum(['critical', 'high', 'medium', 'low']),
});

export type CircuitBreakerRule = z.infer<typeof CircuitBreakerRuleSchema>;

/**
 * Circuit breaker event when a rule triggers
 */
export const CircuitBreakerEventSchema = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  rule: CircuitBreakerRuleSchema,
  metrics: AutonomyMetricsSchema,
  action: CircuitBreakerActionSchema,
  details: z.string(),
  resolved: z.boolean().default(false),
  resolvedAt: z.coerce.date().optional(),
});

export type CircuitBreakerEvent = z.infer<typeof CircuitBreakerEventSchema>;

/**
 * Risk assessment for scope expansion
 */
export const RiskAssessmentSchema = z.object({
  level: z.enum(['low', 'medium', 'high']),
  mitigations: z.array(z.string()),
  rollbackPlan: z.string(),
});

export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;

/**
 * Scope expansion proposal
 */
export const ScopeExpansionProposalSchema = z.object({
  proposalId: z.string(),
  timestamp: z.coerce.date(),
  proposedBy: z.literal('autonomy-governance-agent'),

  expansion: z.object({
    currentPhase: AutonomyPhaseSchema,
    targetPhase: AutonomyPhaseSchema,
    commandsToWhitelist: z.array(z.string()),
    validationPeriod: z.number().int().positive(),
  }),

  rationale: z.object({
    metrics: AutonomyMetricsSchema,
    readiness: ReadinessReportSchema,
    keyAchievements: z.array(z.string()),
  }),

  riskAssessment: RiskAssessmentSchema,

  requiredApprovals: z.array(z.string()),
});

export type ScopeExpansionProposal = z.infer<typeof ScopeExpansionProposalSchema>;

/**
 * Weekly governance report
 */
export const GovernanceReportSchema = z.object({
  id: z.string(),
  weekStart: z.coerce.date(),
  weekEnd: z.coerce.date(),
  generatedAt: z.coerce.date(),

  metrics: AutonomyMetricsSchema,
  readiness: ReadinessReportSchema,

  expansion: ScopeExpansionProposalSchema.optional(),

  circuitBreakerEvents: z.array(CircuitBreakerEventSchema),

  summary: z.string(),
  recommendations: z.array(RecommendationSchema),
  nextActions: z.array(ActionSchema),
});

export type GovernanceReport = z.infer<typeof GovernanceReportSchema>;

/**
 * Governance state for tracking phase transitions
 */
export const GovernanceStateSchema = z.object({
  currentPhase: AutonomyPhaseSchema,
  phaseStartDate: z.coerce.date(),
  commandWhitelist: z.array(z.string()),
  lastReportDate: z.coerce.date().optional(),
  lastExpansionDate: z.coerce.date().optional(),
});

export type GovernanceState = z.infer<typeof GovernanceStateSchema>;
