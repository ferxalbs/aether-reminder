import type { ActionReceipt } from '@/domain/receipts';
import type { ModelCapabilities } from '@/services/ai/inference/types';

/** Explicit UI-supplied context — never scraped from rendered views. */
export interface ContextSnapshot {
  surface: string;
  selectedTaskId?: string;
  selectedDate?: string;
  visibleTaskIds?: string[];
  /** Small references carried across assistant turns, never full entity payloads. */
  conversationEntities?: EntityReference[];
  locale: string;
  timezone: string;
  invocationSource:
    | 'app'
    | 'assistant'
    | 'notification'
    | 'widget'
    | 'shortcut'
    | 'voice';
}

export type AgentSemanticState =
  | 'idle'
  | 'contextualizing'
  | 'thinking'
  | 'executing'
  | 'waiting_confirmation'
  | 'responding'
  | 'error';

export type ToolRisk =
  | 'READ'
  | 'REVERSIBLE_WRITE'
  | 'SENSITIVE_WRITE'
  | 'DESTRUCTIVE'
  | 'EXTERNAL'
  | 'BULK_MUTATION';

export interface SuggestedAction {
  id: string;
  label: string;
  toolId?: string;
  args?: Record<string, unknown>;
}

export interface EntityReference {
  type: 'task' | 'reminder' | 'project';
  id: string;
  label?: string;
}

/** App-owned response contract — model supplies language only. */
export interface AgentResponse {
  text: string;
  receipts?: ActionReceipt[];
  suggestions?: SuggestedAction[];
  entities?: EntityReference[];
}

export interface AgentBudget {
  maxModelTurns: number;
  maxToolCalls: number;
  maxParallelReads: number;
  maxOutputTokens: number;
  /** Absolute deadline (epoch ms). */
  deadlineMs: number;
}

export const DEFAULT_AGENT_BUDGET: AgentBudget = {
  maxModelTurns: 6,
  maxToolCalls: 12,
  maxParallelReads: 4,
  maxOutputTokens: 1200,
  deadlineMs: 0, // set per-run
};

export interface AgentInput {
  message: string;
  context: ContextSnapshot;
  sessionId?: string;
  modelId: string;
  apiKey: string;
  /** App-owned navigation callback. Runtime never accepts arbitrary route strings. */
  onNavigate?: (destination: string, entityId?: string) => void;
  budget?: Partial<AgentBudget>;
}

/** Exact app-validated mutation held while user confirmation is pending. */
export interface PendingAction {
  id: string;
  runId: string;
  toolCallId: string;
  toolId: string;
  args: Record<string, unknown>;
  risk: ToolRisk;
}

export type AgentEvent =
  | {
      type: 'run.started';
      runId: string;
      sessionId: string;
      modelId: string;
      state: AgentSemanticState;
    }
  | {
      type: 'context.ready';
      runId: string;
      context: ContextSnapshot;
      state: AgentSemanticState;
    }
  | {
      type: 'state.changed';
      runId: string;
      state: AgentSemanticState;
      previous?: AgentSemanticState;
    }
  | {
      type: 'model.started';
      runId: string;
      modelId: string;
      capabilities: ModelCapabilities;
      state: AgentSemanticState;
    }
  | {
      type: 'response.delta';
      runId: string;
      text: string;
      state: AgentSemanticState;
    }
  | {
      type: 'tool.proposed';
      runId: string;
      toolCallId: string;
      toolId: string;
      args: unknown;
      risk: ToolRisk;
      state: AgentSemanticState;
    }
  | {
      type: 'tool.confirmation_required';
      runId: string;
      toolCallId: string;
      toolId: string;
      args: unknown;
      risk: ToolRisk;
      reason: string;
      pendingAction: PendingAction;
      state: AgentSemanticState;
    }
  | {
      type: 'tool.started';
      runId: string;
      toolCallId: string;
      toolId: string;
      state: AgentSemanticState;
    }
  | {
      type: 'tool.completed';
      runId: string;
      toolCallId: string;
      toolId: string;
      result: unknown;
      receipt?: ActionReceipt;
      state: AgentSemanticState;
    }
  | {
      type: 'tool.failed';
      runId: string;
      toolCallId: string;
      toolId: string;
      error: string;
      state: AgentSemanticState;
    }
  | {
      type: 'response.completed';
      runId: string;
      response: AgentResponse;
      state: AgentSemanticState;
    }
  | {
      type: 'run.cancelled';
      runId: string;
      state: AgentSemanticState;
    }
  | {
      type: 'run.failed';
      runId: string;
      code: string;
      message: string;
      state: AgentSemanticState;
    };

export interface AgentRuntime {
  run(input: AgentInput): AsyncIterable<AgentEvent>;
  confirm(action: PendingAction, input: Pick<AgentInput, 'context' | 'onNavigate'>): AsyncIterable<AgentEvent>;
  discard(action: PendingAction): Promise<void>;
  cancel(runId: string): Promise<void>;
}
