import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Task } from '@/types';

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

const sampleTasks: Task[] = [
  {
    id: 'demo-1',
    title: 'Review Q3 Product Architecture & Liquid Glass specs',
    notes: 'Focus on frame-rate performance and instant haptic touch responses',
    completed: false,
    createdAt: new Date().toISOString(),
    dueDate: new Date().toISOString().split('T')[0],
    priority: 'high',
    reminderDate: new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: 'demo-2',
    title: 'Finalize OpenRouter API client abstraction',
    notes: 'Support dynamic model swapping without altering screen components',
    completed: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    dueDate: new Date().toISOString().split('T')[0],
    priority: 'high',
  },
  {
    id: 'demo-3',
    title: 'Prepare voice transcription workflow demo',
    notes: 'Ensure waveform animation responds to microphone activity',
    completed: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    dueDate: new Date().toISOString().split('T')[0],
    priority: 'medium',
  },
  {
    id: 'demo-4',
    title: 'Refactor design tokens for Material 3 Expressive contrast',
    notes: 'Verify spacing follows 8pt grid across all card components',
    completed: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    dueDate: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString().split('T')[0], // Overdue
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
          id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          createdAt: new Date().toISOString(),
          completed: false,
          dueDate: taskData.dueDate || new Date().toISOString().split('T')[0],
        };
        set((state) => ({ tasks: [newTask, ...state.tasks] }));
      },

      addTasksBatch: (tasksData) => {
        const newTasks: Task[] = tasksData.map((t) => ({
          ...t,
          id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          createdAt: new Date().toISOString(),
          completed: false,
          dueDate: t.dueDate || new Date().toISOString().split('T')[0],
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
        const todayStr = new Date().toISOString().split('T')[0];
        return get().tasks.filter((t) => t.dueDate === todayStr || !t.dueDate);
      },

      getOverdueTasks: () => {
        const todayStr = new Date().toISOString().split('T')[0];
        return get().tasks.filter((t) => !t.completed && t.dueDate && t.dueDate < todayStr);
      },

      getUpcomingTasks: () => {
        const todayStr = new Date().toISOString().split('T')[0];
        return get().tasks.filter((t) => t.dueDate && t.dueDate > todayStr);
      },
    }),
    {
      name: 'taskflow-tasks-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
