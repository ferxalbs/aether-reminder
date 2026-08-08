/**
 * Ephemeral UI/session state for task surfaces.
 * NOT a mirror of SQLite — holds only the current query result for Home
 * (and small helpers). Mutations go through domain services, not raw SQL.
 */
import { create } from 'zustand';
import { getDatabase, getDatabaseErrorMessage, isDatabaseReady } from '@/db';
import type { CreateTaskInput, Task, TaskListItem, TaskPriority } from '@/domain/entities';
import { toTaskListItem } from '@/domain/entities';
import { createDomainServices, type DomainServices } from '@/domain/services';
import { getLocalDateString } from '@/temporal/localCalendar';

type TasksUiStatus = 'idle' | 'loading' | 'ready' | 'error';

interface TasksUiState {
  status: TasksUiStatus;
  error: string | null;
  /** Current Home query: today + undated active tasks (list items for TaskCard). */
  todayTasks: TaskListItem[];
  /** Bumps on every successful mutation so listeners can refetch other surfaces. */
  revision: number;

  refreshToday: () => Promise<void>;
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
  /** Limited active list for AI overview — not full DB dump. */
  loadActiveForAnalysis: (limit?: number) => Promise<Task[]>;
}

function services(): DomainServices {
  if (!isDatabaseReady()) {
    throw new Error('Database not ready');
  }
  return createDomainServices(getDatabase());
}

export const useTasksUiStore = create<TasksUiState>((set, get) => ({
  status: 'idle',
  error: null,
  todayTasks: [],
  revision: 0,

  refreshToday: async () => {
    set({ status: 'loading', error: null });
    try {
      const tasks = await services().tasks.listTasks({
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

  createTask: async (input) => {
    const { value } = await services().tasks.createTask({
      title: input.title,
      notes: input.notes ?? null,
      priority: input.priority ?? 'medium',
      dueDate: input.dueDate ?? getLocalDateString(),
      source: input.source ?? 'manual',
      creationOrigin: input.source ?? 'manual',
    });
    set((s) => ({ revision: s.revision + 1 }));
    await get().refreshToday();
    return value;
  },

  createTasksBatch: async (inputs) => {
    const svc = services().tasks;
    for (const input of inputs) {
      await svc.createTask({
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
  },

  toggleTask: async (id) => {
    const previousTasks = get().todayTasks;
    const target = previousTasks.find((t) => t.id === id);
    if (!target) return;

    const nextCompleted = !target.completed;
    set((s) => ({
      todayTasks: s.todayTasks.map((t) =>
        t.id === id ? { ...t, completed: nextCompleted } : t
      ),
      revision: s.revision + 1,
    }));

    try {
      const svc = services().tasks;
      if (nextCompleted) {
        await svc.completeTask(id);
      } else {
        await svc.reopenTask(id);
      }
    } catch (error) {
      set({
        todayTasks: previousTasks,
        error: getDatabaseErrorMessage(error),
      });
    }
  },

  softDeleteTask: async (id) => {
    const previousTasks = get().todayTasks;
    set((s) => ({
      todayTasks: s.todayTasks.filter((t) => t.id !== id),
      revision: s.revision + 1,
    }));

    try {
      await services().tasks.deleteTask(id);
    } catch (error) {
      set({
        todayTasks: previousTasks,
        error: getDatabaseErrorMessage(error),
      });
    }
  },

  loadActiveForAnalysis: async (limit = 80) => {
    return services().tasks.listTasks({ scope: 'active', limit });
  },
}));
