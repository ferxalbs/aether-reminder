import { createReceipt } from '@/domain/receipts';
import type { AgentTool, ToolResult } from './types';

export const appNavigate: AgentTool<{
  destination: 'home' | 'tasks' | 'settings';
  entityId?: string;
}> = {
  id: 'app.navigate',
  version: '1',
  description: 'Navigate to an allowlisted AETHER destination: home, tasks, or settings.',
  risk: 'EXTERNAL',
  inputSchema: {
    type: 'object',
    properties: {
      destination: { type: 'string', enum: ['home', 'tasks', 'settings'] },
      entityId: { type: 'string' },
    },
    required: ['destination'],
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  async execute(input, ctx): Promise<ToolResult> {
    const destination = input?.destination;
    if (destination !== 'home' && destination !== 'tasks' && destination !== 'settings') {
      return { ok: false, error: 'destination must be home, tasks, or settings' };
    }
    const entityId = typeof input?.entityId === 'string' ? input.entityId : undefined;
    ctx.onNavigate?.(destination, entityId);
    return {
      ok: true,
      data: {
        destination,
        entityId,
      },
      receipt: createReceipt({
        risk: 'EXTERNAL',
        action: 'app.navigate',
        entityType: 'navigation',
        entityId: destination,
        summary: `Navigate to ${destination}`,
        toolId: 'app.navigate',
      }),
    };
  },
};

export const APP_TOOLS: AgentTool[] = [appNavigate];
