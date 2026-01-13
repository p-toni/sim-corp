/**
 * ReadinessAssessor - Evaluates readiness for L4 autonomy expansion
 *
 * Implements 80-point checklist framework:
 * - Technical: 35 points
 * - Process: 25 points
 * - Organizational: 20 points
 *
 * Threshold: 76 points (95%) required for L4
 */

import type {
  ReadinessReport,
  ChecklistStatus,
  ChecklistItem,
  Recommendation,
  Action,
  AutonomyMetrics,
  AutonomyPhase,
} from '@sim-corp/schemas/kernel/governance';
import { evaluateTechnicalReadiness, type TechnicalChecklistInputs } from './checklists/technical.js';
import { evaluateProcessReadiness, type ProcessChecklistInputs } from './checklists/process.js';
import { evaluateOrganizationalReadiness, type OrganizationalChecklistInputs } from './checklists/organizational.js';
import { generateRecommendations } from './recommendations.js';

export interface ReadinessAssessorConfig {
  // Technical inputs
  metrics: AutonomyMetrics;
  currentPhase: AutonomyPhase;
  daysSincePhaseStart: number;
  evalCoverage: number;
  circuitBreakersImplemented: boolean;
  monitoringOperational: boolean;
  killSwitchTested: boolean;
  chaosTestsPassing: boolean;

  // Process inputs
  incidentResponsePlaybookComplete: boolean;
  runbooksComplete: boolean;
  accountabilityFrameworkDocumented: boolean;
  approvalWorkflowDefined: boolean;
  escalationPathsEstablished: boolean;
  rollbackProceduresTested: boolean;
  complianceRequirementsValidated: boolean;
  auditTrailComprehensive: boolean;

  // Organizational inputs
  teamTrainedOnMonitoring: boolean;
  onCallRotationEstablished: boolean;
  coverage24x7Available: boolean;
  leadershipApprovalObtained: boolean;
  customerCommunicationPlanReady: boolean;
  designPartnerValidationComplete: boolean;
}

export class ReadinessAssessor {
  private config: ReadinessAssessorConfig;

  constructor(config: ReadinessAssessorConfig) {
    this.config = config;
  }

  /**
   * Perform full readiness assessment
   */
  async assess(): Promise<ReadinessReport> {
    // Evaluate each category
    const technical = this.assessTechnical();
    const process = this.assessProcess();
    const organizational = this.assessOrganizational();

    // Calculate overall score
    const overall = this.calculateOverall(technical, process, organizational);

    // Generate recommendations and actions
    const recommendations = generateRecommendations({
      technical,
      process,
      organizational,
      overall,
      metrics: this.config.metrics,
      currentPhase: this.config.currentPhase,
    });

    const nextActions = this.generateNextActions(recommendations);

    return {
      timestamp: new Date(),
      currentPhase: this.config.currentPhase,
      daysSincePhaseStart: this.config.daysSincePhaseStart,
      overall,
      technical,
      process,
      organizational,
      recommendations,
      nextActions,
    };
  }

  /**
   * Assess technical readiness (35 points)
   */
  private assessTechnical(): ChecklistStatus {
    const inputs: TechnicalChecklistInputs = {
      metrics: this.config.metrics,
      daysSincePhaseStart: this.config.daysSincePhaseStart,
      evalCoverage: this.config.evalCoverage,
      circuitBreakersImplemented: this.config.circuitBreakersImplemented,
      monitoringOperational: this.config.monitoringOperational,
      killSwitchTested: this.config.killSwitchTested,
      chaosTestsPassing: this.config.chaosTestsPassing,
    };

    const items = evaluateTechnicalReadiness(inputs);
    const score = this.calculateCategoryScore(items);

    return {
      score,
      maxScore: 35,
      items,
    };
  }

  /**
   * Assess process readiness (25 points)
   */
  private assessProcess(): ChecklistStatus {
    const inputs: ProcessChecklistInputs = {
      incidentResponsePlaybookComplete: this.config.incidentResponsePlaybookComplete,
      runbooksComplete: this.config.runbooksComplete,
      accountabilityFrameworkDocumented: this.config.accountabilityFrameworkDocumented,
      approvalWorkflowDefined: this.config.approvalWorkflowDefined,
      escalationPathsEstablished: this.config.escalationPathsEstablished,
      rollbackProceduresTested: this.config.rollbackProceduresTested,
      complianceRequirementsValidated: this.config.complianceRequirementsValidated,
      auditTrailComprehensive: this.config.auditTrailComprehensive,
    };

    const items = evaluateProcessReadiness(inputs);
    const score = this.calculateCategoryScore(items);

    return {
      score,
      maxScore: 25,
      items,
    };
  }

  /**
   * Assess organizational readiness (20 points)
   */
  private assessOrganizational(): ChecklistStatus {
    const inputs: OrganizationalChecklistInputs = {
      teamTrainedOnMonitoring: this.config.teamTrainedOnMonitoring,
      onCallRotationEstablished: this.config.onCallRotationEstablished,
      coverage24x7Available: this.config.coverage24x7Available,
      leadershipApprovalObtained: this.config.leadershipApprovalObtained,
      customerCommunicationPlanReady: this.config.customerCommunicationPlanReady,
      designPartnerValidationComplete: this.config.designPartnerValidationComplete,
    };

    const items = evaluateOrganizationalReadiness(inputs);
    const score = this.calculateCategoryScore(items);

    return {
      score,
      maxScore: 20,
      items,
    };
  }

  /**
   * Calculate category score from checklist items
   */
  private calculateCategoryScore(items: ChecklistItem[]): number {
    let earned = 0;

    for (const item of items) {
      if (item.status) {
        earned += item.weight;
      }
    }

    return earned;
  }

  /**
   * Calculate overall score and readiness
   */
  private calculateOverall(
    technical: ChecklistStatus,
    process: ChecklistStatus,
    organizational: ChecklistStatus
  ): ReadinessReport['overall'] {
    // Total points earned
    const totalEarned = technical.score + process.score + organizational.score;
    const totalPossible = 80;

    // Overall score (0-1)
    const score = totalEarned / totalPossible;

    // Ready if score >= 0.95 (76/80 points)
    const ready = score >= 0.95;

    // Identify blockers (failed required items)
    const blockers: string[] = [];

    const allItems = [...technical.items, ...process.items, ...organizational.items];
    for (const item of allItems) {
      if (item.required && !item.status) {
        blockers.push(item.name);
      }
    }

    return {
      score,
      ready,
      blockers,
    };
  }

  /**
   * Generate action items from recommendations
   */
  private generateNextActions(recommendations: Recommendation[]): Action[] {
    const actions: Action[] = [];

    // Convert high-priority recommendations into action items
    for (const rec of recommendations) {
      if (rec.priority === 'high') {
        for (const actionDescription of rec.actions) {
          actions.push({
            description: actionDescription,
            completed: false,
          });
        }
      }
    }

    return actions;
  }
}

/**
 * Create assessor from environment and current state
 */
export async function createReadinessAssessor(
  metrics: AutonomyMetrics,
  currentPhase: AutonomyPhase,
  daysSincePhaseStart: number
): Promise<ReadinessAssessor> {
  // In production, these would be fetched from configuration/state
  // For now, use environment variables with sensible defaults

  const config: ReadinessAssessorConfig = {
    // Technical
    metrics,
    currentPhase,
    daysSincePhaseStart,
    evalCoverage: parseFloat(process.env.EVAL_COVERAGE || '0.0'),
    circuitBreakersImplemented: process.env.CIRCUIT_BREAKERS_IMPLEMENTED === 'true',
    monitoringOperational: process.env.MONITORING_OPERATIONAL === 'true',
    killSwitchTested: process.env.KILL_SWITCH_TESTED === 'true',
    chaosTestsPassing: process.env.CHAOS_TESTS_PASSING === 'true',

    // Process
    incidentResponsePlaybookComplete: process.env.INCIDENT_PLAYBOOK_COMPLETE === 'true',
    runbooksComplete: process.env.RUNBOOKS_COMPLETE === 'true',
    accountabilityFrameworkDocumented: process.env.ACCOUNTABILITY_FRAMEWORK_DOCUMENTED === 'true',
    approvalWorkflowDefined: process.env.APPROVAL_WORKFLOW_DEFINED === 'true',
    escalationPathsEstablished: process.env.ESCALATION_PATHS_ESTABLISHED === 'true',
    rollbackProceduresTested: process.env.ROLLBACK_PROCEDURES_TESTED === 'true',
    complianceRequirementsValidated: process.env.COMPLIANCE_REQUIREMENTS_VALIDATED === 'true',
    auditTrailComprehensive: process.env.AUDIT_TRAIL_COMPREHENSIVE === 'true',

    // Organizational
    teamTrainedOnMonitoring: process.env.TEAM_TRAINED_ON_MONITORING === 'true',
    onCallRotationEstablished: process.env.ON_CALL_ROTATION_ESTABLISHED === 'true',
    coverage24x7Available: process.env.COVERAGE_24X7_AVAILABLE === 'true',
    leadershipApprovalObtained: process.env.LEADERSHIP_APPROVAL_OBTAINED === 'true',
    customerCommunicationPlanReady: process.env.CUSTOMER_COMMUNICATION_PLAN_READY === 'true',
    designPartnerValidationComplete: process.env.DESIGN_PARTNER_VALIDATION_COMPLETE === 'true',
  };

  return new ReadinessAssessor(config);
}
