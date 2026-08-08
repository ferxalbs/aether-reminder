/**
 * Ephemeral UI/session state for task surfaces.
 * NOT a mirror of SQLite — holds only the current query result for Home
 * (and small helpers). Mutations go through domain services, not raw SQL.
 */
import { create } from 'zustand';
import { getDatabase, getDatabaseErrorMessage, isDatabaseReady } from '@/db';
import type { CreateTaskInput, Task, TaskListItem, TaskPriority } from '@/domain/entities';
import { toTaskListItem } from '@/domain/entities';
import { getAetherCore, type AetherCore } from '@/core';
import { getLocalDateString } from '@/temporal/localCalendar';
import { reportNonFatalError } from '@/lib/nonFatalError';
import type { ActionReceipt } from '@/domain/receipts';
import { getTaskUndoAction, getTaskUndoTaskId } from './taskUndo';

type TasksUiStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface TasksUiState {
  status: TasksUiStatus;
  error: string | null;
  /** Current Home query: today + undated active tasks (list items for TaskCard). */
  todayTasks: TaskListItem[];
  /** Upcoming query for the Tasks surface. */
  upcomingTasks: TaskListItem[];
  /** Bumps on every successful mutation so listeners can refetch other surfaces. */
  revision: number;
  /** Most recent reversible task mutation, kept outside persisted state. */
  undoReceipt: ActionReceipt | null;
  undoError: string | null;
  undoing: boolean;

  refreshToday: () => Promise<void>;
  refreshUpcoming: () => Promise<void>;
  createTask: (input: {
    title: string;
    notes?: string;
    priority?: TaskPriority;
    dueDate?: string;
    source?: CreateTaskInput['source'];
  }) => Promise<Task>;
  createTasksBatch: (
    inputs: {
      title: string;
      notes?: string;
      priority?: TaskPriority;
      dueDate?: string;
      source?: CreateTaskInput['source'];
    }[]
  ) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  softDeleteTask: (id: string) => Promise<void>;
  setUndoReceipt: (receipt: ActionReceipt) => void;
  undoLastMutation: () => Promise<void>;
  dismissUndo: () => void;
}

function core(): AetherCore {
  if (!isDatabaseReady()) {
    throw new Error('Database not ready');
  }
  return getAetherCore(getDatabase());
}

export const useTasksUiStore = create<TasksUiState>((set, get) => ({
  status: 'idle',
  error: null,
  todayTasks: [],
  upcomingTasks: [],
  revision: 0,
  undoReceipt: null,
  undoError: null,
  undoing: false,

  refreshToday: async () => {
    set({ status: 'loading', error: null });
    try {
      const tasks = await core().services.tasks.listTasks({
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
      const tasks = await core().services.tasks.listTasks({
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

  createTask: async (input) => {
    let value: Task;
    let receipt: ActionReceipt;
    try {
      ({ value, receipt } = await core().commands.createTask({
        title: input.title,
        notes: input.notes ?? null,
        priority: input.priority ?? 'medium',
        dueDate: input.dueDate ?? getLocalDateString(),
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
    await get().refreshToday();
    await get().refreshUpcoming();
    return value;
  },

  createTasksBatch: async (inputs) => {
    let lastReceipt: ActionReceipt | null = null;
    try {
      const commands = core().commands;
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
    await get().refreshToday();
    await get().refreshUpcoming();
  },

  toggleTask: async (id) => {
    const previousTodayTasks = get().todayTasks;
    const previousUpcomingTasks = get().upcomingTasks;
    const target = [...previousTodayTasks, ...previousUpcomingTasks].find((t) => t.id === id);
    if (!target) return;

    const nextCompleted = !target.completed;
    set((s) => ({
      todayTasks: s.todayTasks.map((t) =>
        t.id === id ? { ...t, completed: nextCompleted } : t
      ),
      upcomingTasks: s.upcomingTasks.map((t) =>
        t.id === id ? { ...t, completed: nextCompleted } : t
      ),
      revision: s.revision + 1,
    }));

    try {
      const commands = core().commands;
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
        error: getDatabaseErrorMessage(error),
      });
      return;
    }
    await get().refreshToday();
    await get().refreshUpcoming();
  },

  softDeleteTask: async (id) => {
    const previousTodayTasks = get().todayTasks;
    const previousUpcomingTasks = get().upcomingTasks;
    set((s) => ({
      todayTasks: s.todayTasks.filter((t) => t.id !== id),
      upcomingTasks: s.upcomingTasks.filter((t) => t.id !== id),
      revision: s.revision + 1,
    }));

    try {
      const result = await core().commands.deleteTask(id);
      set({ undoReceipt: result.receipt, undoError: null });
    } catch (error) {
      reportNonFatalError('task-delete', error);
      set({
        status: 'error',
        todayTasks: previousTodayTasks,
        upcomingTasks: previousUpcomingTasks,
        error: getDatabaseErrorMessage(error),
      });
      return;
    }
    await get().refreshToday();
    await get().refreshUpcoming();
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
    const taskId = getTaskUndoTaskId(receipt);
    if (!action || !taskId) {
      set({ undoReceipt: null, undoError: null, undoing: false });
      return;
    }

    set({ undoing: true, undoError: null });
    try {
      const commands = core().commands;
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
      }

      set((s) => ({
        undoReceipt: null,
        undoError: null,
        undoing: false,
        revision: s.revision + 1,
      }));
      await get().refreshToday();
      await get().refreshUpcoming();
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
