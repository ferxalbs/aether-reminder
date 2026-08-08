import type { ActionReceipt } from '@/domain/receipts';
import type { AgentSemanticState, ContextSnapshot, EntityReference, PendingAction } from '@/services/agent';

export type AssistantSurfaceState = 'closed' | 'opening' | 'compact' | 'medium' | 'full' | 'closing';

export type AssistantOrbState = AgentSemanticState | 'opening' | 'closing' | 'connecting' | 'listening' | 'transcribing' | 'finalizing';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistantReceipt {
  receipt: ActionReceipt;
  toolId: string;
}

export interface PendingAssistantConfirmation {
  action: PendingAction;
  reason: string;
}

export interface AssistantSessionState {
  messages: AssistantMessage[];
  receipts: AssistantReceipt[];
  pendingConfirmation: PendingAssistantConfirmation | null;
  semanticState: AgentSemanticState;
  error: string | null;
  isRunning: boolean;
  context: ContextSnapshot;
  entities: EntityReference[];
}
