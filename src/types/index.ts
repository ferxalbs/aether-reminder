export type TaskPriority = 'low' | 'medium' | 'high';

export interface Reminder {
  id: string;
  taskId: string;
  time: string; // ISO string
  enabled: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  completed: boolean;
  createdAt: string; // ISO string
  dueDate?: string; // YYYY-MM-DD or ISO
  priority: TaskPriority;
  reminderDate?: string;
  aiSuggested?: boolean;
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
    priority: TaskPriority;
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
