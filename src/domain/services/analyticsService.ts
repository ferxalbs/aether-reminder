import type { Task } from "@/domain/entities";
import { TasksRepository } from "@/db/repositories/tasksRepository";
import {
  getLocalDateString,
  isLocalDateBefore,
} from "@/temporal/localCalendar";

export interface WorkloadSnapshot {
  asOfLocalDate: string;
  totalActive: number;
  pending: number;
  completed: number;
  overdue: number;
  dueToday: number;
  highPriorityPending: number;
  /** Compact titles for context — not a full DB dump. */
  samplePendingTitles: string[];
  sampleOverdueTitles: string[];
}

/**
 * Minimal read-only analytics foundation.
 * No mutation paths. Safe for agent tools and future widgets.
 */
export class AnalyticsService {
  constructor(private readonly tasks: TasksRepository) {}

  async getWorkload(options?: {
    localDate?: string;
    sampleLimit?: number;
  }): Promise<WorkloadSnapshot> {
    const localDate = options?.localDate ?? getLocalDateString();
    const sampleLimit = options?.sampleLimit ?? 5;
    const active = await this.tasks.listActive({ limit: 500 });
    const pending = active.filter((t) => !t.completed);
    const completed = active.filter((t) => t.completed);
    const overdue = pending.filter(
      (t) => t.dueDate != null && isLocalDateBefore(t.dueDate, localDate),
    );
    const dueToday = pending.filter((t) => t.dueDate === localDate);
    const highPriorityPending = pending.filter((t) => t.priority === "high");

    return {
      asOfLocalDate: localDate,
      totalActive: active.length,
      pending: pending.length,
      completed: completed.length,
      overdue: overdue.length,
      dueToday: dueToday.length,
      highPriorityPending: highPriorityPending.length,
      samplePendingTitles: titles(pending, sampleLimit),
      sampleOverdueTitles: titles(overdue, sampleLimit),
    };
  }
}

function titles(tasks: Task[], limit: number): string[] {
  return tasks.slice(0, limit).map((t) => t.title);
}
