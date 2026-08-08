/**
 * Action receipts for reversible mutations (future Undo UI).
 * Produced by domain services / tools — never invented by the model.
 */

import { createId } from '@/lib/id';

export type ReceiptEntityType = 'task' | 'reminder' | 'navigation';

export type ReceiptRisk =
  | 'READ'
  | 'REVERSIBLE_WRITE'
  | 'SENSITIVE_WRITE'
  | 'DESTRUCTIVE'
  | 'EXTERNAL'
  | 'BULK_MUTATION';

export interface ActionReceipt {
  id: string;
  toolId?: string;
  risk: ReceiptRisk;
  action: string;
  entityType: ReceiptEntityType;
  entityId: string;
  summary: string;
  /** Opaque undo payload for a future Undo surface — not auto-executed. */
  undo?: {
    kind: string;
    payload: Record<string, unknown>;
  };
  createdAt: string;
}

export function createReceipt(
  partial: Omit<ActionReceipt, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): ActionReceipt {
  return {
    id: partial.id ?? createId(),
    toolId: partial.toolId,
    risk: partial.risk,
    action: partial.action,
    entityType: partial.entityType,
    entityId: partial.entityId,
    summary: partial.summary,
    undo: partial.undo,
    createdAt: partial.createdAt ?? new Date().toISOString(),
  };
}
