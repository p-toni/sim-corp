/**
 * Organizational Readiness Checklist (20 points)
 *
 * Evaluates organizational readiness for L4 autonomy:
 * - Team readiness (10 points)
 * - Stakeholder alignment (10 points)
 */

import type { ChecklistItem } from '@sim-corp/schemas/kernel/governance';

export interface OrganizationalChecklistInputs {
  teamTrainedOnMonitoring: boolean;
  onCallRotationEstablished: boolean;
  coverage24x7Available: boolean;
  leadershipApprovalObtained: boolean;
  customerCommunicationPlanReady: boolean;
  designPartnerValidationComplete: boolean;
}

/**
 * Evaluate organizational readiness checklist
 */
export function evaluateOrganizationalReadiness(inputs: OrganizationalChecklistInputs): ChecklistItem[] {
  return [
    // Team (10 points)
    {
      name: 'Team trained on monitoring',
      weight: 5,
      required: true,
      status: inputs.teamTrainedOnMonitoring,
      details: inputs.teamTrainedOnMonitoring
        ? 'Team trained on monitoring autonomous operations'
        : 'Team not trained on monitoring',
    },
    {
      name: 'On-call rotation established',
      weight: 3,
      required: true,
      status: inputs.onCallRotationEstablished,
      details: inputs.onCallRotationEstablished
        ? 'On-call rotation established with clear responsibilities'
        : 'On-call rotation not established',
    },
    {
      name: '24/7 coverage available',
      weight: 2,
      required: false,
      status: inputs.coverage24x7Available,
      details: inputs.coverage24x7Available
        ? '24/7 coverage available for incidents'
        : '24/7 coverage not available',
    },

    // Stakeholder (10 points)
    {
      name: 'Leadership approval obtained',
      weight: 5,
      required: true,
      status: inputs.leadershipApprovalObtained,
      details: inputs.leadershipApprovalObtained
        ? 'Leadership approval obtained for L4 expansion'
        : 'Leadership approval not obtained',
    },
    {
      name: 'Customer communication plan ready',
      weight: 3,
      required: false,
      status: inputs.customerCommunicationPlanReady,
      details: inputs.customerCommunicationPlanReady
        ? 'Customer communication plan ready'
        : 'Customer communication plan not ready',
    },
    {
      name: 'Design partner validation complete',
      weight: 2,
      required: true,
      status: inputs.designPartnerValidationComplete,
      details: inputs.designPartnerValidationComplete
        ? 'Design partner validation complete'
        : 'Design partner validation not complete',
    },
  ];
}
