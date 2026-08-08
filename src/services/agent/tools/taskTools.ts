import type { TaskPriority } from '@/domain/entities';
import { resolveTomorrow, resolveToday, assertResolvedDateTime } from '@/temporal/resolve';
import type { AgentTool, ToolResult } from './types';

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asPriority(v: unknown): TaskPriority | undefined {
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  return undefined;
}

export const tasksGet: AgentTool<{ id: string }> = {
  id: 'tasks.get',
  version: '1',
  description: 'Get a single task by id.',
  risk: 'READ',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  async execute(input, ctx): Promise<ToolResult> {
    const id = asString(input?.id);
    if (!id) return { ok: false, error: 'id is required' };
    const task = await ctx.services.tasks.getTask(id);
    if (!task) return { ok: false, error: 'Task not found' };
    return { ok: true, data: { task } };
  },
};

export const tasksList: AgentTool<{
  scope?: 'today' | 'overdue' | 'upcoming' | 'active';
  localDate?: string;
  limit?: number;
  completed?: boolean;
}> = {
  id: 'tasks.list',
  version: '1',
  description: 'List tasks by scope (today, overdue, upcoming, active).',
  risk: 'READ',
  inputSchema: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['today', 'overdue', 'upcoming', 'active'] },
      localDate: { type: 'string', description: 'YYYY-MM-DD' },
      limit: { type: 'number' },
      completed: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  async execute(input, ctx): Promise<ToolResult> {
    const scope = input?.scope ?? 'today';
    const localDate =
      asString(input?.localDate) ??
      ctx.context.selectedDate ??
      resolveToday().date;
    const tasks = await ctx.services.tasks.listTasks({
      scope,
      localDate,
      limit: typeof input?.limit === 'number' ? input.limit : 50,
      completed: input?.completed,
    });
    return {
      ok: true,
      data: {
        scope,
        localDate,
        count: tasks.length,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          completed: t.completed,
          priority: t.priority,
          dueDate: t.dueDate,
          dueTime: t.dueTime,
        })),
      },
    };
  },
};

export const tasksSearch: AgentTool<{ query: string; limit?: number }> = {
  id: 'tasks.search',
  version: '1',
  description: 'Search tasks by title/notes substring.',
  risk: 'READ',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  async execute(input, ctx): Promise<ToolResult> {
    const query = asString(input?.query)?.trim();
    if (!query) return { ok: false, error: 'query is required' };
    const tasks = await ctx.services.tasks.searchTasks(
      query,
      typeof input?.limit === 'number' ? input.limit : 50
    );
    return {
      ok: true,
      data: {
        query,
        count: tasks.length,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          completed: t.completed,
          dueDate: t.dueDate,
        })),
      },
    };
  },
};

export const tasksCreate: AgentTool<{
  title: string;
  notes?: string;
  priority?: TaskPriority;
  dueDate?: string;
  dueTime?: string;
  dueSemantics?: 'fixed' | 'floating';
}> = {
  id: 'tasks.create',
  version: '1',
  description: 'Create a task. Use YYYY-MM-DD for dueDate. Prefer tomorrow as resolved local date when user says tomorrow.',
  risk: 'REVERSIBLE_WRITE',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      notes: { type: 'string' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      dueDate: { type: 'string' },
      dueTime: { type: 'string' },
      dueSemantics: { type: 'string', enum: ['fixed', 'floating'] },
    },
    required: ['title'],
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  async execute(input, ctx): Promise<ToolResult> {
    const title = asString(input?.title)?.trim();
    if (!title) return { ok: false, error: 'title is required' };

    let dueDate = asString(input?.dueDate);
    if (dueDate === 'today') dueDate = resolveToday().date;
    if (dueDate === 'tomorrow') dueDate = resolveTomorrow().date;

    try {
      if (dueDate) {
        assertResolvedDateTime({
          date: dueDate,
          time: asString(input?.dueTime),
          timezone: ctx.context.timezone,
          semantics: input?.dueSemantics ?? 'floating',
        });
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Invalid due date' };
    }

    const { value, receipt } = await ctx.services.tasks.createTask(
      {
        title,
        notes: asString(input?.notes) ?? null,
        priority: asPriority(input?.priority) ?? 'medium',
        dueDate: dueDate ?? resolveToday().date,
        dueTime: asString(input?.dueTime) ?? null,
        dueTimezone: ctx.context.timezone,
        dueSemantics: input?.dueSemantics ?? 'floating',
        source: 'agent',
        creationOrigin: 'agent',
      },
      ctx.eventSource
    );

    return {
      ok: true,
      data: { task: { id: value.id, title: value.title, dueDate: value.dueDate } },
      receipt: { ...receipt, toolId: 'tasks.create' },
    };
  },
};

export const tasksUpdate: AgentTool<{
  id: string;
  title?: string;
  notes?: string;
  priority?: TaskPriority;
  dueDate?: string;
  dueTime?: string;
}> = {
  id: 'tasks.update',
  version: '1',
  description: 'Update task fields by id.',
  risk: 'REVERSIBLE_WRITE',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
      notes: { type: 'string' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      dueDate: { type: 'string' },
      dueTime: { type: 'string' },
    },
    required: ['id'],
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  async execute(input, ctx): Promise<ToolResult> {
    const id = asString(input?.id);
    if (!id) return { ok: false, error: 'id is required' };
    try {
      if (input?.dueDate) {
        assertResolvedDateTime({
          date: input.dueDate,
          time: asString(input?.dueTime),
          timezone: ctx.context.timezone,
        });
      }
      const { value, receipt } = await ctx.services.tasks.updateTask(
        id,
        {
          title: asString(input?.title),
          notes: asString(input?.notes),
          priority: asPriority(input?.priority),
          dueDate: asString(input?.dueDate),
          dueTime: asString(input?.dueTime),
        },
        ctx.eventSource
      );
      return {
        ok: true,
        data: { task: { id: value.id, title: value.title } },
        receipt: { ...receipt, toolId: 'tasks.update' },
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Update failed' };
    }
  },
};

export const tasksComplete: AgentTool<{ id: string }> = {
  id: 'tasks.complete',
  version: '1',
  description: 'Mark a task completed by id.',
  risk: 'REVERSIBLE_WRITE',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  async execute(input, ctx): Promise<ToolResult> {
    const id = asString(input?.id);
    if (!id) return { ok: false, error: 'id is required' };
    try {
      const { value, receipt } = await ctx.services.tasks.completeTask(id, ctx.eventSource);
      return {
        ok: true,
        data: { task: { id: value.id, title: value.title, completed: true } },
        receipt: { ...receipt, toolId: 'tasks.complete' },
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Complete failed' };
    }
  },
};

export const tasksReopen: AgentTool<{ id: string }> = {
  id: 'tasks.reopen',
  version: '1',
  description: 'Reopen a completed task by id.',
  risk: 'REVERSIBLE_WRITE',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  async execute(input, ctx): Promise<ToolResult> {
    const id = asString(input?.id);
    if (!id) return { ok: false, error: 'id is required' };
    try {
      const { value, receipt } = await ctx.services.tasks.reopenTask(id, ctx.eventSource);
      return {
        ok: true,
        data: { task: { id: value.id, title: value.title, completed: false } },
        receipt: { ...receipt, toolId: 'tasks.reopen' },
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Reopen failed' };
    }
  },
};

export const tasksDelete: AgentTool<{ id?: string; ids?: string[] }> = {
  id: 'tasks.delete',
  version: '1',
  description:
    'Soft-delete task(s). Single id is reversible. Multiple ids may require confirmation when bulk.',
  risk: 'REVERSIBLE_WRITE',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      ids: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  estimateAffectedCount(input) {
    if (Array.isArray(input?.ids)) return input.ids.length;
    return input?.id ? 1 : 0;
  },
  async execute(input, ctx): Promise<ToolResult> {
    const ids: string[] = [];
    if (asString(input?.id)) ids.push(asString(input.id)!);
    if (Array.isArray(input?.ids)) {
      for (const x of input.ids) {
        if (typeof x === 'string' && x) ids.push(x);
      }
    }
    const unique = [...new Set(ids)];
    if (unique.length === 0) return { ok: false, error: 'id or ids is required' };

    const deleted: string[] = [];
    const receipts = [];
    for (const id of unique) {
      try {
        const { receipt } = await ctx.services.tasks.deleteTask(id, ctx.eventSource);
        deleted.push(id);
        receipts.push({ ...receipt, toolId: 'tasks.delete' });
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Delete failed',
          affectedCount: unique.length,
        };
      }
    }

    return {
      ok: true,
      data: { deletedIds: deleted, softDelete: true },
      receipt: receipts[0],
      affectedCount: unique.length,
    };
  },
};

export const TASK_TOOLS: AgentTool[] = [
  tasksGet,
  tasksList,
  tasksSearch,
  tasksCreate,
  tasksUpdate,
  tasksComplete,
  tasksReopen,
  tasksDelete,
];
