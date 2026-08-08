import type { AgentTool, ToolResult } from './types';

export const analyticsWorkload: AgentTool<{ localDate?: string }> = {
  id: 'analytics.workload',
  version: '1',
  description: 'Read-only workload counts (pending, overdue, due today). Not a full task dump.',
  risk: 'READ',
  inputSchema: {
    type: 'object',
    properties: {
      localDate: { type: 'string', description: 'YYYY-MM-DD' },
    },
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  async execute(input, ctx): Promise<ToolResult> {
    const snapshot = await ctx.services.analytics.getWorkload({
      localDate: typeof input?.localDate === 'string' ? input.localDate : undefined,
    });
    return { ok: true, data: snapshot };
  },
};

export const ANALYTICS_TOOLS: AgentTool[] = [analyticsWorkload];
