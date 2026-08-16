/**
 * Shared UI / API types.
 * Domain entities live in `@/domain/entities`. This module keeps lightweight
 * shapes used by screens and provider integrations.
 */

export type { TaskPriority } from "@/domain/entities";
export type { TaskListItem } from "@/domain/entities";

/** @deprecated Prefer domain Task / TaskListItem — kept for AI service bridge. */
export interface Task {
  id: string;
  title: string;
  notes?: string;
  completed: boolean;
  createdAt: string;
  dueDate?: string;
  priority: import("@/domain/entities").TaskPriority;
  reminderDate?: string;
  aiSuggested?: boolean;
}

export interface Reminder {
  id: string;
  taskId: string;
  time: string;
  enabled: boolean;
}

export type ThemePreference = "system" | "dark" | "light";

export interface UserSettings {
  selectedModel: string;
  theme: ThemePreference;
  materialColorsEnabled: boolean;
  hapticsEnabled: boolean;
  autoSummarize: boolean;
  /** Conservative opt-in for local adaptive follow-up notifications. */
  adaptiveNudgesEnabled: boolean;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
}
