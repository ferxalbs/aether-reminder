import type { InferenceToolDefinition } from "@/services/ai/inference/types";
import { ANALYTICS_TOOLS } from "./analyticsTools";
import { APP_TOOLS } from "./appTools";
import { RECURRENCE_TOOLS } from "./recurrenceTools";
import { REMINDER_TOOLS } from "./reminderTools";
import { TASK_TOOLS } from "./taskTools";
import type { AgentTool } from "./types";

const ALL_TOOLS: AgentTool[] = [
  ...TASK_TOOLS,
  ...RECURRENCE_TOOLS,
  ...REMINDER_TOOLS,
  ...ANALYTICS_TOOLS,
  ...APP_TOOLS,
];

export class ToolRegistry {
  private readonly byId = new Map<string, AgentTool>();

  constructor(tools: AgentTool[] = ALL_TOOLS) {
    for (const tool of tools) {
      this.byId.set(tool.id, tool);
    }
  }

  get(id: string): AgentTool | undefined {
    return this.byId.get(id);
  }

  list(): AgentTool[] {
    return [...this.byId.values()];
  }

  ids(): string[] {
    return [...this.byId.keys()];
  }

  toInferenceTools(): InferenceToolDefinition[] {
    return this.list().map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.id,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }
}

export const defaultToolRegistry = new ToolRegistry();

export { ALL_TOOLS };
