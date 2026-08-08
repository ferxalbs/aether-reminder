/**
 * Shared UI / API types.
 * Domain entities live in `@/domain/entities`. This module keeps lightweight
 * shapes used by screens and legacy AI services.
 */

export type { TaskPriority } from '@/domain/entities';
export type { TaskListItem } from '@/domain/entities';

/** @deprecated Prefer domain Task / TaskListItem — kept for AI service bridge. */
export interface Task {
  id: string;
  title: string;
  notes?: string;
  completed: boolean;
  createdAt: string;
  dueDate?: string;
  priority: import('@/domain/entities').TaskPriority;
  reminderDate?: string;
  aiSuggested?: boolean;
}

export interface Reminder {
  id: string;
  taskId: string;
  time: string;
  enabled: boolean;
}

export interface AIResponse {
  summary: string;
  priorities: string[];
  overdueAlerts: string[];
  insights: string[];
}

export interface TranscriptionResult {
  text: string;
  taskCandidates: {
    title: string;
    priority: import('@/domain/entities').TaskPriority;
    notes?: string;
  }[];
}

export type ThemePreference = 'system' | 'dark' | 'light';

export interface UserSettings {
  openRouterApiKey: string;
  selectedModel: string;
  theme: ThemePreference;
  hapticsEnabled: boolean;
  autoSummarize: boolean;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
}
