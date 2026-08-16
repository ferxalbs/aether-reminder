import { resolveToday } from "@/temporal/resolve";
import {
  tasksComplete,
  tasksCreate,
  tasksList,
  tasksUpdate,
} from "./taskTools";
import type { AgentTool, ToolResult } from "./types";

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export const listTasks: AgentTool<{ filter?: "now" | "next" | "all" }> = {
  id: "list_tasks",
  version: "1",
  description:
    "List local AETHER tasks. Executed on the device, never by Cloud.",
  risk: "READ",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      filter: { type: "string", enum: ["now", "next", "all"] },
    },
  },
  outputSchema: { type: "object" },
  async execute(input, ctx): Promise<ToolResult> {
    const filter = input?.filter ?? "all";
    if (filter === "all") {
      return tasksList.execute({ scope: "active" }, ctx);
    }

    const plan = await ctx.services.attention.plan();
    if (filter === "now") {
      return {
        ok: true,
        data: {
          filter,
          now: plan.now,
          count: plan.now ? 1 : 0,
        },
      };
    }

    return {
      ok: true,
      data: {
        filter,
        next: plan.next,
        count: plan.next.length,
      },
    };
  },
};

export const proposeTaskMutation: AgentTool<{
  action: "create" | "complete" | "reschedule" | "update";
  taskId?: string;
  title?: string;
}> = {
  id: "propose_task_mutation",
  version: "1",
  description:
    "Propose a local task mutation. The device confirms, mutates SQLite, and can undo.",
  risk: "REVERSIBLE_WRITE",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["action"],
    properties: {
      action: {
        type: "string",
        enum: ["create", "complete", "reschedule", "update"],
      },
      taskId: { type: "string" },
      title: { type: "string" },
    },
  },
  outputSchema: { type: "object" },
  async execute(input, ctx): Promise<ToolResult> {
    const action = input?.action;
    if (action === "create") {
      const title = asString(input?.title)?.trim();
      if (!title) return { ok: false, error: "title is required" };
      const created = await tasksCreate.execute(
        { title, dueDate: resolveToday().date },
        ctx,
      );
      if (!created.ok || !created.receipt) return created;
      return {
        ...created,
        receipt: { ...created.receipt, toolId: "propose_task_mutation" },
      };
    }

    const taskId = asString(input?.taskId);
    if (!taskId) return { ok: false, error: "taskId is required" };

    if (action === "complete") {
      const completed = await tasksComplete.execute({ id: taskId }, ctx);
      if (!completed.ok || !completed.receipt) return completed;
      return {
        ...completed,
        receipt: { ...completed.receipt, toolId: "propose_task_mutation" },
      };
    }

    if (action === "update" || action === "reschedule") {
      const title = asString(input?.title)?.trim();
      if (action === "reschedule" && !title) {
        return {
          ok: false,
          error:
            "reschedule requires a local due date; hosted toolset only supplies title/taskId.",
        };
      }
      const updated = await tasksUpdate.execute({ id: taskId, title }, ctx);
      if (!updated.ok || !updated.receipt) return updated;
      return {
        ...updated,
        receipt: { ...updated.receipt, toolId: "propose_task_mutation" },
      };
    }

    return { ok: false, error: "Unsupported mutation action." };
  },
};

export const CLOUD_TASK_TOOLS: AgentTool[] = [listTasks, proposeTaskMutation];
