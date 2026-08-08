import type { ActionReceipt } from '@/domain/receipts';
import type { DomainServices } from '@/domain/services';
import type { ContextSnapshot, ToolRisk } from '../types';

export interface ToolExecutionContext {
  services: DomainServices;
  context: ContextSnapshot;
  runId: string;
  eventSource: string;
  /**
   * Navigate is app-owned; runtime collects proposed routes without a router.
   * Slice 4 will wire this to the real navigator.
   */
  onNavigate?: (route: string, params?: Record<string, unknown>) => void;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  receipt?: ActionReceipt;
  /** For bulk policy evaluation after args parse. */
  affectedCount?: number;
}

export interface AgentTool<TInput = unknown> {
  id: string;
  version: string;
  description: string;
  risk: ToolRisk;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  execute(input: TInput, ctx: ToolExecutionContext): Promise<ToolResult>;
  /** Optional: estimate affected entities before execute (bulk policy). */
  estimateAffectedCount?(input: TInput, ctx: ToolExecutionContext): Promise<number> | number;
}
