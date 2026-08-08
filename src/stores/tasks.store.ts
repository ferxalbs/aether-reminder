import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Task } from '@/types';
import { getLocalDateString, isLocalDateAfter, isLocalDateBefore } from '@/temporal/localCalendar';

interface TasksState {
  tasks: Task[];
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'completed'>) => void;
  addTasksBatch: (tasks: Omit<Task, 'id' | 'createdAt' | 'completed'>[]) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  clearCompleted: () => void;
  getTodayTasks: () => Task[];
  getOverdueTasks: () => Task[];
  getUpcomingTasks: () => Task[];
}

function createTaskId(): string {
  // Temporary until domain layer uses deterministic ULIDs. Still unique enough for local UI.
  return `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function localYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLocalDateString(d);
}

/** Seed data for first launch only — removed when SQLite migration lands. */
const sampleTasks: Task[] = [
  {
    id: 'demo-1',
    title: 'Review Q3 Product Architecture & Liquid Glass specs',
    notes: 'Focus on frame-rate performance and instant haptic touch responses',
    completed: false,
    createdAt: new Date().toISOString(),
    dueDate: getLocalDateString(),
    priority: 'high',
    reminderDate: new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: 'demo-2',
    title: 'Finalize OpenRouter API client abstraction',
    notes: 'Support dynamic model swapping without altering screen components',
    completed: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    dueDate: getLocalDateString(),
    priority: 'high',
  },
  {
    id: 'demo-3',
    title: 'Prepare voice transcription workflow demo',
    notes: 'Ensure waveform animation responds to microphone activity',
    completed: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    dueDate: getLocalDateString(),
    priority: 'medium',
  },
  {
    id: 'demo-4',
    title: 'Refactor design tokens for Material 3 Expressive contrast',
    notes: 'Verify spacing follows 8pt grid across all card components',
    completed: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    dueDate: localYesterday(),
    priority: 'medium',
  },
];

export const useTasksStore = create<TasksState>()(
  persist(
    (set, get) => ({
      tasks: sampleTasks,

      addTask: (taskData) => {
        const newTask: Task = {
          ...taskData,
          id: createTaskId(),
          createdAt: new Date().toISOString(),
          completed: false,
          dueDate: taskData.dueDate || getLocalDateString(),
        };
        set((state) => ({ tasks: [newTask, ...state.tasks] }));
      },

      addTasksBatch: (tasksData) => {
        const today = getLocalDateString();
        const newTasks: Task[] = tasksData.map((t) => ({
          ...t,
          id: createTaskId(),
          createdAt: new Date().toISOString(),
          completed: false,
          dueDate: t.dueDate || today,
        }));
        set((state) => ({ tasks: [...newTasks, ...state.tasks] }));
      },

      toggleTask: (id) => {
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, completed: !task.completed } : task
          ),
        }));
      },

      deleteTask: (id) => {
        set((state) => ({
          tasks: state.tasks.filter((task) => task.id !== id),
        }));
      },

      updateTask: (id, updates) => {
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, ...updates } : task
          ),
        }));
      },

      clearCompleted: () => {
        set((state) => ({
          tasks: state.tasks.filter((task) => !task.completed),
        }));
      },

      getTodayTasks: () => {
        const todayStr = getLocalDateString();
        return get().tasks.filter((t) => t.dueDate === todayStr || !t.dueDate);
      },

      getOverdueTasks: () => {
        const todayStr = getLocalDateString();
        return get().tasks.filter(
          (t) => !t.completed && t.dueDate && isLocalDateBefore(t.dueDate, todayStr)
        );
      },

      getUpcomingTasks: () => {
        const todayStr = getLocalDateString();
        return get().tasks.filter((t) => t.dueDate && isLocalDateAfter(t.dueDate, todayStr));
      },
    }),
    {
      name: 'taskflow-tasks-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
