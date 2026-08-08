import { assertResolvedDateTime, resolveTomorrow, resolveToday } from '@/temporal/resolve';
import type { AgentTool, ToolResult } from './types';

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

const OS_NOTE = 'SQLite is authoritative; local notification delivery is reconciled with the OS.';

export const remindersList: AgentTool<{ taskId?: string; enabledOnly?: boolean }> = {
  id: 'reminders.list',
  version: '1',
  description: 'List reminders (domain state). ' + OS_NOTE,
  risk: 'READ',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      enabledOnly: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  async execute(input, ctx): Promise<ToolResult> {
    const list = await ctx.services.reminders.listReminders({
      taskId: asString(input?.taskId),
      enabledOnly: input?.enabledOnly,
    });
    return {
      ok: true,
      data: {
        count: list.length,
        reminders: list,
        osNotificationProjection: list.every((item) => !item.enabled || item.nativeNotificationId) ? 'reconciled' : 'pending_repair',
        note: OS_NOTE,
      },
    };
  },
};

export const remindersSchedule: AgentTool<{
  taskId: string;
  scheduledDate: string;
  scheduledTime?: string;
}> = {
  id: 'reminders.schedule',
  version: '1',
  description: 'Schedule a domain reminder for a task. ' + OS_NOTE,
  risk: 'REVERSIBLE_WRITE',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      scheduledDate: { type: 'string' },
      scheduledTime: { type: 'string' },
    },
    required: ['taskId', 'scheduledDate'],
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  async execute(input, ctx): Promise<ToolResult> {
    const taskId = asString(input?.taskId);
    let scheduledDate = asString(input?.scheduledDate);
    if (!taskId || !scheduledDate) {
      return { ok: false, error: 'taskId and scheduledDate are required' };
    }
    if (scheduledDate === 'today') scheduledDate = resolveToday().date;
    if (scheduledDate === 'tomorrow') scheduledDate = resolveTomorrow().date;

    try {
      assertResolvedDateTime({
        date: scheduledDate,
        time: asString(input?.scheduledTime),
        timezone: ctx.context.timezone,
      });
      const result = await ctx.commands.scheduleReminder({
        taskId,
        scheduledDate,
        scheduledTime: asString(input?.scheduledTime),
        timezone: ctx.context.timezone,
      });
      return {
        ok: true,
        data: {
          reminder: result.value,
          osNotificationProjection: result.osNotificationProjection,
          note: OS_NOTE,
          projectionError: result.projectionError,
        },
        receipt: { ...result.receipt, toolId: 'reminders.schedule' },
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Schedule failed' };
    }
  },
};

export const remindersReschedule: AgentTool<{
  id: string;
  scheduledDate: string;
  scheduledTime?: string;
}> = {
  id: 'reminders.reschedule',
  version: '1',
  description: 'Reschedule a domain reminder. ' + OS_NOTE,
  risk: 'REVERSIBLE_WRITE',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      scheduledDate: { type: 'string' },
      scheduledTime: { type: 'string' },
    },
    required: ['id', 'scheduledDate'],
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  async execute(input, ctx): Promise<ToolResult> {
    const id = asString(input?.id);
    const scheduledDate = asString(input?.scheduledDate);
    if (!id || !scheduledDate) return { ok: false, error: 'id and scheduledDate are required' };
    try {
      const result = await ctx.commands.rescheduleReminder(id, {
        scheduledDate,
        scheduledTime: asString(input?.scheduledTime),
        timezone: ctx.context.timezone,
      });
      return {
        ok: true,
        data: {
          reminder: result.value,
          osNotificationProjection: result.osNotificationProjection,
          note: OS_NOTE,
          projectionError: result.projectionError,
        },
        receipt: { ...result.receipt, toolId: 'reminders.reschedule' },
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Reschedule failed' };
    }
  },
};

export const remindersCancel: AgentTool<{ id: string }> = {
  id: 'reminders.cancel',
  version: '1',
  description: 'Cancel (disable) a domain reminder. ' + OS_NOTE,
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
      const result = await ctx.commands.cancelReminder(id);
      return {
        ok: true,
        data: {
          reminder: result.value,
          osNotificationProjection: result.osNotificationProjection,
          note: OS_NOTE,
          projectionError: result.projectionError,
        },
        receipt: { ...result.receipt, toolId: 'reminders.cancel' },
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Cancel failed' };
    }
  },
};

export const REMINDER_TOOLS: AgentTool[] = [
  remindersList,
  remindersSchedule,
  remindersReschedule,
  remindersCancel,
];
