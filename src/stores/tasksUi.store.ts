/**
 * Ephemeral UI/session state for task surfaces.
 * NOT a mirror of SQLite — holds only the current query result for Home
 * (and small helpers). Mutations always go through repositories.
 */
import { create } from 'zustand';
import {
  createRepositories,
  getDatabaseErrorMessage,
  isDatabaseReady,
  type Repositories,
} from '@/db';
import type { CreateTaskInput, Task, TaskListItem, TaskPriority } from '@/domain/entities';
import { toTaskListItem } from '@/domain/entities';
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

function repos(): Repositories {
  if (!isDatabaseReady()) {
    throw new Error('Database not ready');
  }
  return createRepositories();
}

export const useTasksUiStore = create<TasksUiState>((set, get) => ({
  status: 'idle',
  error: null,
  todayTasks: [],
  revision: 0,

  refreshToday: async () => {
    set({ status: 'loading', error: null });
    try {
      const tasks = await repos().tasks.listToday(getLocalDateString());
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
    const task = await repos().tasks.create({
      title: input.title,
      notes: input.notes ?? null,
      priority: input.priority ?? 'medium',
      dueDate: input.dueDate ?? getLocalDateString(),
      source: input.source ?? 'manual',
      creationOrigin: input.source ?? 'manual',
    });
    set((s) => ({ revision: s.revision + 1 }));
    await get().refreshToday();
    return task;
  },

  createTasksBatch: async (inputs) => {
    const { tasks } = repos();
    for (const input of inputs) {
      await tasks.create({
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
    const { tasks } = repos();
    const current = await tasks.getById(id);
    if (!current) return;
    if (current.completed) {
      await tasks.reopen(id);
    } else {
      await tasks.complete(id);
    }
    set((s) => ({ revision: s.revision + 1 }));
    await get().refreshToday();
  },

  softDeleteTask: async (id) => {
    await repos().tasks.softDelete(id);
    set((s) => ({ revision: s.revision + 1 }));
    await get().refreshToday();
  },

  loadActiveForAnalysis: async (limit = 80) => {
    return repos().tasks.listActive({ limit });
  },
}));
