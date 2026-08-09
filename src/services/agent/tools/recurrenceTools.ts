import type { RecurrenceFrequency, RecurrenceMode, TaskPriority } from '@/domain/entities';
import { resolveToday } from '@/temporal/resolve';
import type { AgentTool, ToolResult } from './types';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asPositiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : undefined;
}

function asNumberArray(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'number')
    ? value
    : undefined;
}

function asPriority(value: unknown): TaskPriority | undefined {
  return value === 'low' || value === 'medium' || value === 'high' ? value : undefined;
}

function asFrequency(value: unknown): RecurrenceFrequency | undefined {
  return value === 'daily' || value === 'weekly' || value === 'monthly' || value === 'yearly'
    ? value
    : undefined;
}

function asMode(value: unknown): RecurrenceMode | undefined {
  return value === 'fixed' || value === 'after_completion' ? value : undefined;
}

export const recurrenceGet: AgentTool<{ taskId: string }> = {
  id: 'tasks.recurrence_get',
  version: '1',
  description: 'Get the active recurrence rule for a task.',
  risk: 'READ',
  inputSchema: {
    type: 'object',
    properties: { taskId: { type: 'string' } },
    required: ['taskId'],
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  async execute(input, ctx): Promise<ToolResult> {
    const taskId = asString(input?.taskId);
    if (!taskId) return { ok: false, error: 'taskId is required' };
    const rule = await ctx.services.recurrence.getRuleForTask(taskId);
    return { ok: true, data: { rule } };
  },
};

export const recurrenceCreate: AgentTool<Record<string, unknown>> = {
  id: 'tasks.create_recurring',
  version: '1',
  description: 'Create a task with a local recurrence rule. Use resolved YYYY-MM-DD dates.',
  risk: 'REVERSIBLE_WRITE',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      notes: { type: 'string' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      startDate: { type: 'string' },
      startTime: { type: 'string' },
      frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'] },
      interval: { type: 'number' },
      weekdays: { type: 'array', items: { type: 'number' } },
      monthDays: { type: 'array', items: { type: 'number' } },
      mode: { type: 'string', enum: ['fixed', 'after_completion'] },
      endDate: { type: 'string' },
      maxOccurrences: { type: 'number' },
    },
    required: ['title', 'frequency'],
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  async execute(input, ctx): Promise<ToolResult> {
    const title = asString(input?.title)?.trim();
    const frequency = asFrequency(input?.frequency);
    if (!title || !frequency) return { ok: false, error: 'title and frequency are required' };
    const startDate = asString(input?.startDate) ?? ctx.context.selectedDate ?? resolveToday().date;
    const startTime = asString(input?.startTime) ?? null;
    try {
      const result = await ctx.commands.createRecurringTask(
        {
          task: {
            title,
            notes: asString(input?.notes) ?? null,
            priority: asPriority(input?.priority) ?? 'medium',
            dueDate: startDate,
            dueTime: startTime,
            dueTimezone: ctx.context.timezone,
            dueSemantics: 'floating',
            source: 'agent',
            creationOrigin: 'agent',
          },
          recurrence: {
            frequency,
            interval: asPositiveInt(input?.interval) ?? 1,
            weekdays: asNumberArray(input?.weekdays) ?? null,
            monthDays: asNumberArray(input?.monthDays) ?? null,
            mode: asMode(input?.mode) ?? 'fixed',
            endDate: asString(input?.endDate) ?? null,
            maxOccurrences: asPositiveInt(input?.maxOccurrences) ?? null,
            timezone: ctx.context.timezone,
            startDate,
          },
        },
        ctx.eventSource,
      );
      const reminder = startTime
        ? await ctx.commands.scheduleReminder(
            {
              taskId: result.task.id,
              scheduledDate: startDate,
              scheduledTime: startTime,
              timezone: ctx.context.timezone,
              semantics: 'floating',
            },
            ctx.eventSource,
          )
        : null;
      return {
        ok: true,
        data: {
          task: result.task,
          recurrence: result.rule,
          reminder: reminder?.value,
          osNotificationProjection: reminder?.osNotificationProjection,
        },
        receipt: { ...result.receipt, toolId: 'tasks.create_recurring' },
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Recurring task creation failed' };
    }
  },
};

export const recurrenceUpdate: AgentTool<Record<string, unknown>> = {
  id: 'tasks.update_recurrence',
  version: '1',
  description: 'Update an existing recurrence rule by rule id.',
  risk: 'REVERSIBLE_WRITE',
  inputSchema: {
    type: 'object',
    properties: {
      ruleId: { type: 'string' },
      frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'] },
      interval: { type: 'number' },
      weekdays: { type: 'array', items: { type: 'number' } },
      monthDays: { type: 'array', items: { type: 'number' } },
      mode: { type: 'string', enum: ['fixed', 'after_completion'] },
      endDate: { type: 'string' },
      maxOccurrences: { type: 'number' },
    },
    required: ['ruleId'],
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  async execute(input, ctx): Promise<ToolResult> {
    const ruleId = asString(input?.ruleId);
    if (!ruleId) return { ok: false, error: 'ruleId is required' };
    try {
      const result = await ctx.commands.updateRecurrenceRule(ruleId, {
        frequency: asFrequency(input?.frequency),
        interval: asPositiveInt(input?.interval),
        weekdays: input?.weekdays === undefined ? undefined : (asNumberArray(input.weekdays) ?? null),
        monthDays: input?.monthDays === undefined ? undefined : (asNumberArray(input.monthDays) ?? null),
        mode: asMode(input?.mode),
        endDate: input?.endDate === undefined ? undefined : (asString(input.endDate) ?? null),
        maxOccurrences: input?.maxOccurrences === undefined ? undefined : (asPositiveInt(input.maxOccurrences) ?? null),
      });
      return {
        ok: true,
        data: { recurrence: result.value },
        receipt: { ...result.receipt, toolId: 'tasks.update_recurrence' },
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Recurrence update failed' };
    }
  },
};

export const recurrenceStop: AgentTool<{ ruleId: string }> = {
  id: 'tasks.stop_recurrence',
  version: '1',
  description: 'Stop a recurrence rule without deleting the current task.',
  risk: 'REVERSIBLE_WRITE',
  inputSchema: {
    type: 'object',
    properties: { ruleId: { type: 'string' } },
    required: ['ruleId'],
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  async execute(input, ctx): Promise<ToolResult> {
    const ruleId = asString(input?.ruleId);
    if (!ruleId) return { ok: false, error: 'ruleId is required' };
    try {
      const result = await ctx.commands.stopRecurrenceRule(ruleId);
      return {
        ok: true,
        data: { recurrence: result.value },
        receipt: { ...result.receipt, toolId: 'tasks.stop_recurrence' },
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Recurrence stop failed' };
    }
  },
};

export const RECURRENCE_TOOLS: AgentTool[] = [
  recurrenceGet,
  recurrenceCreate,
  recurrenceUpdate,
  recurrenceStop,
];
