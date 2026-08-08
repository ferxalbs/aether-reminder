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

type TasksUiStatus = 'idle' | 'loading' | 'ready' | 'error';

interface TasksUiState {
  status: TasksUiStatus;
  error: string | null;
  /** Current Home query: today + undated active tasks (list items for TaskCard). */
  todayTasks: TaskListItem[];
  /** Upcoming query for the Tasks surface. */
  upcomingTasks: TaskListItem[];
  /** Bumps on every successful mutation so listeners can refetch other surfaces. */
  revision: number;

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
      set({
        status: 'error',
        error: getDatabaseErrorMessage(error),
      });
    }
  },

  createTask: async (input) => {
    const { value } = await core().commands.createTask({
      title: input.title,
      notes: input.notes ?? null,
      priority: input.priority ?? 'medium',
      dueDate: input.dueDate ?? getLocalDateString(),
      source: input.source ?? 'manual',
      creationOrigin: input.source ?? 'manual',
    });
    set((s) => ({ revision: s.revision + 1 }));
    await get().refreshToday();
    await get().refreshUpcoming();
    return value;
  },

  createTasksBatch: async (inputs) => {
    const commands = core().commands;
    for (const input of inputs) {
      await commands.createTask({
        title: input.title,
        notes: input.notes ?? null,
        priority: input.priority ?? 'medium',
        dueDate: input.dueDate ?? getLocalDateString(),
        source: input.source ?? 'voice',
        creationOrigin: input.source ?? 'voice',
      });
    }
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
      if (nextCompleted) {
        await commands.completeTask(id);
      } else {
        await commands.reopenTask(id);
      }
    } catch (error) {
      set({
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
      await core().commands.deleteTask(id);
    } catch (error) {
      set({
        todayTasks: previousTodayTasks,
        upcomingTasks: previousUpcomingTasks,
        error: getDatabaseErrorMessage(error),
      });
      return;
    }
    await get().refreshToday();
    await get().refreshUpcoming();
  },

}));
