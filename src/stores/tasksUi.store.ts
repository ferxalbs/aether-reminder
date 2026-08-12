/**
 * Ephemeral UI/session state for task surfaces.
 * NOT a mirror of SQLite — holds only the current query result for Home
 * (and small helpers). Mutations go through domain services, not raw SQL.
 */
import { create } from 'zustand';
import { getDatabaseErrorMessage, initializeDatabase } from '@/db';
import type {
  CreateTaskInput,
  RecurrenceRule,
  Task,
  TaskListItem,
  TaskPriority,
  UpdateTaskInput,
} from '@/domain/entities';
import { toTaskListItem } from '@/domain/entities';
import { getAetherCore, type AetherCore } from '@/core';
import type { TaskEditorRecurrenceDraft } from '@/core/commands';
import { getLocalDateString } from '@/temporal/localCalendar';
import { reportNonFatalError } from '@/lib/nonFatalError';
import type { ActionReceipt } from '@/domain/receipts';
import {
  RECOVERY_UNDO_KIND,
  type RecoveryApplyResult,
  type RecoveryApplySelection,
  type RecoveryPlan,
} from '@/domain/recovery';
import { getTaskUndoAction, getTaskUndoRestoreFields, getTaskUndoTaskId } from './taskUndo';

type TasksUiStatus = 'idle' | 'loading' | 'ready' | 'error';
type RecoveryUiStatus = 'idle' | 'loading' | 'ready' | 'applying' | 'error';

export interface TaskEditorCreateInput {
  title: string;
  notes?: string;
  priority?: TaskPriority;
  dueDate: string;
  dueTime?: string | null;
  dueTimezone?: string | null;
  dueSemantics?: CreateTaskInput['dueSemantics'];
  source?: CreateTaskInput['source'];
  recurrence: TaskEditorRecurrenceDraft;
}

export interface TasksUiState {
  status: TasksUiStatus;
  error: string | null;
  /** Current Home query: today + undated active tasks (list items for TaskCard). */
  todayTasks: TaskListItem[];
  /** Upcoming query for the Tasks surface. */
  upcomingTasks: TaskListItem[];
  /** Complete active inventory for the All surface, including completed items. */
  allTasks: TaskListItem[];
  /** Bumps on every successful mutation so listeners can refetch other surfaces. */
  revision: number;
  /** Most recent reversible task mutation, kept outside persisted state. */
  undoReceipt: ActionReceipt | null;
  undoError: string | null;
  undoing: boolean;
  recoveryStatus: RecoveryUiStatus;
  recoveryPlan: RecoveryPlan | null;
  recoveryError: string | null;

  refreshToday: () => Promise<void>;
  refreshUpcoming: () => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshRecovery: () => Promise<void>;
  /** Refresh all task projections concurrently and publish one coherent snapshot. */
  refreshAllSurfaces: () => Promise<void>;
  getRecurrenceRule: (taskId: string) => Promise<RecurrenceRule | null>;
  createTask: (input: {
    title: string;
    notes?: string;
    priority?: TaskPriority;
    dueDate?: string | null;
    dueTime?: string | null;
    dueTimezone?: string | null;
    dueSemantics?: CreateTaskInput['dueSemantics'];
    source?: CreateTaskInput['source'];
  }) => Promise<Task>;
  createTaskWithRecurrence: (input: TaskEditorCreateInput) => Promise<Task>;
  saveTaskEditor: (
    id: string,
    input: { task: UpdateTaskInput; recurrence: TaskEditorRecurrenceDraft | null },
  ) => Promise<Task>;
  createTasksBatch: (
    inputs: {
      title: string;
      notes?: string;
      priority?: TaskPriority;
      dueDate?: string;
      source?: CreateTaskInput['source'];
    }[]
  ) => Promise<void>;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<Task>;
  applyRecovery: (selections: readonly RecoveryApplySelection[]) => Promise<RecoveryApplyResult>;
  setAdaptiveNudgesEnabled: (enabled: boolean) => Promise<void>;
  resetAdaptiveNudgeLearning: () => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  softDeleteTask: (id: string) => Promise<void>;
  setUndoReceipt: (receipt: ActionReceipt) => void;
  undoLastMutation: () => Promise<void>;
  dismissUndo: () => void;
}

async function core(): Promise<AetherCore> {
  const { db } = await initializeDatabase();
  return getAetherCore(db);
}

export const useTasksUiStore = create<TasksUiState>((set, get) => ({
  status: 'idle',
  error: null,
  todayTasks: [],
  upcomingTasks: [],
  allTasks: [],
  revision: 0,
  undoReceipt: null,
  undoError: null,
  undoing: false,
  recoveryStatus: 'idle',
  recoveryPlan: null,
  recoveryError: null,

  refreshToday: async () => {
    set({ status: 'loading', error: null });
    try {
      const tasks = await (await core()).services.tasks.listTasks({
        scope: 'today',
        localDate: getLocalDateString(),
      });
      set({
        todayTasks: tasks.map(toTaskListItem),
        status: 'ready',
        error: null,
      });
    } catch (error) {
      reportNonFatalError('tasks-refresh-today', error);
      set({
        status: 'error',
        error: getDatabaseErrorMessage(error),
      });
    }
  },

  refreshUpcoming: async () => {
    set({ status: 'loading', error: null });
    try {
      const tasks = await (await core()).services.tasks.listTasks({
        scope: 'upcoming',
        localDate: getLocalDateString(),
        limit: 100,
      });
      set({
        upcomingTasks: tasks.map(toTaskListItem),
        status: 'ready',
        error: null,
      });
    } catch (error) {
      reportNonFatalError('tasks-refresh-upcoming', error);
      set({
        status: 'error',
        error: getDatabaseErrorMessage(error),
      });
    }
  },

  refreshAll: async () => {
    set({ status: 'loading', error: null });
    try {
      const tasks = await (await core()).services.tasks.listTasks({ scope: 'all' });
      set({
        allTasks: tasks.map(toTaskListItem),
        status: 'ready',
        error: null,
      });
    } catch (error) {
      reportNonFatalError('tasks-refresh-all', error);
      set({
        status: 'error',
        error: getDatabaseErrorMessage(error),
      });
    }
  },

  refreshRecovery: async () => {
    set({ recoveryStatus: 'loading', recoveryError: null });
    try {
      const plan = await (await core()).services.recovery.generatePlan();
      set({
        recoveryPlan: plan.proposals.length > 0 ? plan : null,
        recoveryStatus: 'ready',
        recoveryError: null,
      });
    } catch (error) {
      reportNonFatalError('recovery-refresh', error);
      set({
        recoveryStatus: 'error',
        recoveryError: getDatabaseErrorMessage(error),
      });
    }
  },

  refreshAllSurfaces: async () => {
    set({ status: 'loading', error: null });
    try {
      const tasks = (await core()).services.tasks;
      const localDate = getLocalDateString();
      const [today, upcoming, all] = await Promise.all([
        tasks.listTasks({ scope: 'today', localDate }),
        tasks.listTasks({ scope: 'upcoming', localDate, limit: 100 }),
        tasks.listTasks({ scope: 'all' }),
      ]);
      set({
        todayTasks: today.map(toTaskListItem),
        upcomingTasks: upcoming.map(toTaskListItem),
        allTasks: all.map(toTaskListItem),
        status: 'ready',
        error: null,
      });
    } catch (error) {
      reportNonFatalError('tasks-refresh-surfaces', error);
      set({
        status: 'error',
        error: getDatabaseErrorMessage(error),
      });
    }
  },

  getRecurrenceRule: async (taskId) => {
    try {
      return await (await core()).services.recurrence.getRuleForTask(taskId);
    } catch (error) {
      reportNonFatalError('task-recurrence-read', error);
      throw error;
    }
  },

  createTask: async (input) => {
    let value: Task;
    let receipt: ActionReceipt;
    try {
      ({ value, receipt } = await (await core()).commands.createTask({
        title: input.title,
        notes: input.notes ?? null,
        priority: input.priority ?? 'medium',
        dueDate: input.dueDate === undefined ? getLocalDateString() : input.dueDate,
        dueTime: input.dueTime ?? null,
        dueTimezone: input.dueTimezone ?? null,
        dueSemantics: input.dueSemantics ?? 'floating',
        source: input.source ?? 'manual',
        creationOrigin: input.source ?? 'manual',
      }));
    } catch (error) {
      reportNonFatalError('task-create', error);
      set({ status: 'error', error: getDatabaseErrorMessage(error) });
      throw error;
    }
    set({ undoReceipt: receipt, undoError: null });
    set((s) => ({ revision: s.revision + 1 }));
    await get().refreshAllSurfaces();
    await get().refreshRecovery();
    return value;
  },

  createTaskWithRecurrence: async (input) => {
    try {
      const result = await (await core()).commands.createRecurringTask(
        {
          task: {
            title: input.title,
            notes: input.notes ?? null,
            priority: input.priority ?? 'medium',
            dueDate: input.dueDate,
            dueTime: input.dueTime ?? null,
            dueTimezone: input.dueTimezone ?? null,
            dueSemantics: input.dueSemantics ?? 'floating',
            source: input.source ?? 'manual',
            creationOrigin: input.source ?? 'manual',
          },
          recurrence: input.recurrence,
        },
        input.source ?? 'manual',
      );
      set({ undoReceipt: result.receipt, undoError: null });
      set((s) => ({ revision: s.revision + 1 }));
      await get().refreshAllSurfaces();
      await get().refreshRecovery();
      return result.task;
    } catch (error) {
      reportNonFatalError('task-create-recurring', error);
      set({ status: 'error', error: getDatabaseErrorMessage(error) });
      throw error;
    }
  },

  saveTaskEditor: async (id, input) => {
    try {
      const result = await (await core()).commands.saveTaskEditorState(id, input);
      set({ undoReceipt: result.receipt, undoError: null });
      set((s) => ({ revision: s.revision + 1 }));
      await get().refreshAllSurfaces();
      await get().refreshRecovery();
      return result.value;
    } catch (error) {
      reportNonFatalError('task-editor-save', error);
      set({ status: 'error', error: getDatabaseErrorMessage(error) });
      throw error;
    }
  },

  updateTask: async (id, input) => {
    let value: Task;
    let receipt: ActionReceipt;
    try {
      ({ value, receipt } = await (await core()).commands.updateTask(id, input));
    } catch (error) {
      reportNonFatalError('task-update', error);
      set({ status: 'error', error: getDatabaseErrorMessage(error) });
      throw error;
    }
    set({ undoReceipt: receipt, undoError: null });
    set((s) => ({ revision: s.revision + 1 }));
    await get().refreshAllSurfaces();
    await get().refreshRecovery();
    return value;
  },

  applyRecovery: async (selections) => {
    const plan = get().recoveryPlan;
    if (!plan) throw new Error('Recovery plan is no longer available.');
    set({ recoveryStatus: 'applying', recoveryError: null });
    try {
      const result = await (await core()).commands.applyRecovery(plan.id, selections);
      if (result.receipt) set({ undoReceipt: result.receipt, undoError: null });
      set((s) => ({ revision: s.revision + 1 }));
      await get().refreshAllSurfaces();
      await get().refreshRecovery();
      return result;
    } catch (error) {
      reportNonFatalError('recovery-apply', error);
      set({
        recoveryStatus: 'error',
        recoveryError: getDatabaseErrorMessage(error),
      });
      throw error;
    }
  },

  setAdaptiveNudgesEnabled: async (enabled) => {
    try {
      await (await core()).commands.setAdaptiveNudgesEnabled(enabled);
    } catch (error) {
      reportNonFatalError('adaptive-nudges-setting', error);
      set({ error: getDatabaseErrorMessage(error) });
      throw error;
    }
  },

  resetAdaptiveNudgeLearning: async () => {
    try {
      await (await core()).commands.resetAdaptiveNudgeLearning();
    } catch (error) {
      reportNonFatalError('adaptive-nudges-reset', error);
      set({ error: getDatabaseErrorMessage(error) });
      throw error;
    }
  },

  createTasksBatch: async (inputs) => {
    let lastReceipt: ActionReceipt | null = null;
    try {
      const commands = (await core()).commands;
      for (const input of inputs) {
        const result = await commands.createTask({
          title: input.title,
          notes: input.notes ?? null,
          priority: input.priority ?? 'medium',
          dueDate: input.dueDate ?? getLocalDateString(),
          source: input.source ?? 'voice',
          creationOrigin: input.source ?? 'voice',
        });
        lastReceipt = result.receipt;
      }
    } catch (error) {
      reportNonFatalError('tasks-create-batch', error);
      set({
        status: 'error',
        error: getDatabaseErrorMessage(error),
        ...(lastReceipt ? { undoReceipt: lastReceipt, undoError: null } : {}),
      });
      throw error;
    }
    if (lastReceipt) set({ undoReceipt: lastReceipt, undoError: null });
    set((s) => ({ revision: s.revision + 1 }));
    await get().refreshAllSurfaces();
    await get().refreshRecovery();
  },

  toggleTask: async (id) => {
    const previousTodayTasks = get().todayTasks;
    const previousUpcomingTasks = get().upcomingTasks;
    const previousAllTasks = get().allTasks;
    const target = [...previousTodayTasks, ...previousUpcomingTasks, ...previousAllTasks].find(
      (t) => t.id === id,
    );
    if (!target) return;

    const nextCompleted = !target.completed;
    set((s) => ({
      todayTasks: s.todayTasks.map((t) =>
        t.id === id ? { ...t, completed: nextCompleted } : t
      ),
      upcomingTasks: s.upcomingTasks.map((t) =>
        t.id === id ? { ...t, completed: nextCompleted } : t
      ),
      allTasks: s.allTasks.map((t) =>
        t.id === id ? { ...t, completed: nextCompleted } : t
      ),
      revision: s.revision + 1,
    }));

    try {
      const commands = (await core()).commands;
      const result = nextCompleted
        ? await commands.completeTask(id)
        : await commands.reopenTask(id);
      set({ undoReceipt: result.receipt, undoError: null });
    } catch (error) {
      reportNonFatalError('task-toggle', error);
      set({
        status: 'error',
        todayTasks: previousTodayTasks,
        upcomingTasks: previousUpcomingTasks,
        allTasks: previousAllTasks,
        error: getDatabaseErrorMessage(error),
      });
      return;
    }
    await get().refreshAllSurfaces();
    await get().refreshRecovery();
  },

  softDeleteTask: async (id) => {
    const previousTodayTasks = get().todayTasks;
    const previousUpcomingTasks = get().upcomingTasks;
    const previousAllTasks = get().allTasks;
    set((s) => ({
      todayTasks: s.todayTasks.filter((t) => t.id !== id),
      upcomingTasks: s.upcomingTasks.filter((t) => t.id !== id),
      allTasks: s.allTasks.filter((t) => t.id !== id),
      revision: s.revision + 1,
    }));

    try {
      const result = await (await core()).commands.deleteTask(id);
      set({ undoReceipt: result.receipt, undoError: null });
    } catch (error) {
      reportNonFatalError('task-delete', error);
      set({
        status: 'error',
        todayTasks: previousTodayTasks,
        upcomingTasks: previousUpcomingTasks,
        allTasks: previousAllTasks,
        error: getDatabaseErrorMessage(error),
      });
      return;
    }
    await get().refreshAllSurfaces();
    await get().refreshRecovery();
  },

  setUndoReceipt: (receipt) => {
    // Read receipts must not erase a still-actionable task undo. Any write
    // receipt replaces it, even when this UI cannot execute that undo kind.
    if (receipt.risk === 'READ') return;
    set({ undoReceipt: receipt, undoError: null, undoing: false });
  },

  undoLastMutation: async () => {
    const receipt = get().undoReceipt;
    const action = getTaskUndoAction(receipt);
    if (action === RECOVERY_UNDO_KIND && receipt) {
      set({ undoing: true, undoError: null });
      try {
        await (await core()).commands.undoRecovery(receipt);
        set((s) => ({
          undoReceipt: null,
          undoError: null,
          undoing: false,
          revision: s.revision + 1,
        }));
        await get().refreshAllSurfaces();
        await get().refreshRecovery();
      } catch (error) {
        reportNonFatalError('recovery-undo', error);
        set({
          status: 'error',
          undoing: false,
          undoError: getDatabaseErrorMessage(error),
          error: getDatabaseErrorMessage(error),
        });
      }
      return;
    }
    const taskId = getTaskUndoTaskId(receipt);
    if (!action || !taskId) {
      set({ undoReceipt: null, undoError: null, undoing: false });
      return;
    }

    set({ undoing: true, undoError: null });
    try {
      const commands = (await core()).commands;
      switch (action) {
        case 'task.soft_delete':
          await commands.deleteTask(taskId, 'undo');
          break;
        case 'task.reopen':
          await commands.reopenTask(taskId, 'undo');
          break;
        case 'task.complete':
          await commands.completeTask(taskId, 'undo');
          break;
        case 'task.restore_soft_deleted':
          await commands.restoreTask(taskId, 'undo');
          break;
        case 'task.restore_fields': {
          const fields = getTaskUndoRestoreFields(receipt);
          if (!fields) throw new Error('Task update undo payload is invalid.');
          await commands.updateTask(taskId, fields, 'undo');
          break;
        }
      }

      set((s) => ({
        undoReceipt: null,
        undoError: null,
        undoing: false,
        revision: s.revision + 1,
      }));
      await get().refreshAllSurfaces();
      await get().refreshRecovery();
    } catch (error) {
      reportNonFatalError('task-undo', error);
      set({
        status: 'error',
        undoing: false,
        undoError: getDatabaseErrorMessage(error),
        error: getDatabaseErrorMessage(error),
      });
    }
  },

  dismissUndo: () => set({ undoReceipt: null, undoError: null, undoing: false }),

}));
