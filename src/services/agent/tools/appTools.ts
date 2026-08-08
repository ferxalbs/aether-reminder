import { createReceipt } from '@/domain/receipts';
import type { AgentTool, ToolResult } from './types';

export const appNavigate: AgentTool<{ route: string; params?: Record<string, unknown> }> = {
  id: 'app.navigate',
  version: '1',
  description:
    'Propose in-app navigation. Slice 4 will host the real navigator; this tool records intent only.',
  risk: 'EXTERNAL',
  inputSchema: {
    type: 'object',
    properties: {
      route: { type: 'string' },
      params: { type: 'object' },
    },
    required: ['route'],
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  async execute(input, ctx): Promise<ToolResult> {
    const route = typeof input?.route === 'string' ? input.route.trim() : '';
    if (!route) return { ok: false, error: 'route is required' };
    ctx.onNavigate?.(route, input?.params);
    return {
      ok: true,
      data: {
        route,
        params: input?.params ?? {},
        projected: false,
        note: 'Navigation host not wired until Slice 4; intent recorded only.',
      },
      receipt: createReceipt({
        risk: 'EXTERNAL',
        action: 'app.navigate',
        entityType: 'navigation',
        entityId: route,
        summary: `Navigate to ${route}`,
        toolId: 'app.navigate',
      }),
    };
  },
};

export const APP_TOOLS: AgentTool[] = [appNavigate];
