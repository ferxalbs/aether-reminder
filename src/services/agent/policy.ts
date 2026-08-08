import type { ToolRisk } from './types';

export type PolicyDecision =
  | { decision: 'allow'; risk: ToolRisk }
  | { decision: 'allow_with_receipt'; risk: ToolRisk }
  | { decision: 'require_confirmation'; risk: ToolRisk; reason: string }
  | { decision: 'deny'; risk: ToolRisk; reason: string };

/** Default bulk threshold — above this, bulk mutations require confirmation. */
export const BULK_MUTATION_THRESHOLD = 3;

/**
 * Policy engine: the LLM never decides confirmation.
 * Soft-delete is REVERSIBLE_WRITE (receipt). True destructive ops require confirmation.
 */
export function evaluateToolPolicy(input: {
  risk: ToolRisk;
  /** Estimated affected entities for bulk detection. */
  affectedCount?: number;
  toolId: string;
}): PolicyDecision {
  const count = input.affectedCount ?? 1;

  if (input.risk === 'READ') {
    return { decision: 'allow', risk: 'READ' };
  }

  if (input.risk === 'EXTERNAL') {
    return {
      decision: 'require_confirmation',
      risk: 'EXTERNAL',
      reason: 'External side effects require confirmation.',
    };
  }

  if (input.risk === 'DESTRUCTIVE') {
    return {
      decision: 'require_confirmation',
      risk: 'DESTRUCTIVE',
      reason: 'Destructive operations require confirmation.',
    };
  }

  if (input.risk === 'BULK_MUTATION' || count > BULK_MUTATION_THRESHOLD) {
    return {
      decision: 'require_confirmation',
      risk: 'BULK_MUTATION',
      reason: `Bulk mutation of ${count} items requires confirmation (threshold ${BULK_MUTATION_THRESHOLD}).`,
    };
  }

  if (input.risk === 'SENSITIVE_WRITE') {
    return {
      decision: 'require_confirmation',
      risk: 'SENSITIVE_WRITE',
      reason: 'Sensitive writes require confirmation.',
    };
  }

  // REVERSIBLE_WRITE (create, complete, reopen, reschedule, soft-delete)
  return { decision: 'allow_with_receipt', risk: 'REVERSIBLE_WRITE' };
}

export function isWriteRisk(risk: ToolRisk): boolean {
  return risk !== 'READ';
}
