import type {
  CreateTaskInput,
  Task,
  TaskCaptureSource,
  UpdateTaskInput,
} from "@/domain/entities";
import {
  assertRecoverySchedule,
  type RecoverySchedule,
} from "@/domain/recovery";
import { createReceipt, type ActionReceipt } from "@/domain/receipts";
import { TasksRepository } from "@/db/repositories/tasksRepository";
import { assertResolvedDateTime } from "@/temporal/resolve";
import type { TemporalSemantics } from "@/temporal/types";
import type {
  ConditionalTaskScheduleOutcome,
  CaptureCommitContext,
} from "@/db/repositories/tasksRepository";
import type { CaptureCommitsRepository } from "@/db/repositories/captureCommitsRepository";

export type TaskListScope =
  "today" | "overdue" | "upcoming" | "all" | "active" | "all_active";

export interface ListTasksOptions {
  scope?: TaskListScope;
  localDate?: string;
  projectId?: string;
  priority?: Task["priority"];
  completed?: boolean;
  limit?: number;
}

export interface RescheduleTaskInput {
  dueDate: string;
  dueTime?: string | null;
  dueTimezone?: string | null;
  dueSemantics?: TemporalSemantics;
}

export interface MutationResult<T> {
  value: T;
  receipt: ActionReceipt;
}

export interface ConditionalRecoveryScheduleChange {
  taskId: string;
  expectedUpdatedAt: string;
  schedule: RecoverySchedule;
}

/**
 * Domain service for tasks. UI and agent tools mutate through this layer,
 * not repositories directly. Preserves Slice 2 transaction + task_event guarantees
 * (repositories still own SQL).
 */
export class TaskService {
  constructor(
    private readonly tasks: TasksRepository,
    private readonly captureCommits?: CaptureCommitsRepository,
  ) {}

  async listCaptureSources(taskId: string): Promise<TaskCaptureSource[]> {
    return this.captureCommits?.listSources(taskId) ?? [];
  }

  async createTask(
    input: CreateTaskInput,
    eventSource = "manual",
  ): Promise<MutationResult<Task>> {
    if (input.dueDate != null) {
      const resolved = assertResolvedDateTime({
        date: input.dueDate,
        time: input.dueTime,
        timezone: input.dueTimezone,
        semantics: input.dueSemantics,
      });
      input = {
        ...input,
        dueDate: resolved.date,
        dueTime: resolved.time,
        dueTimezone: resolved.timezone,
        dueSemantics: resolved.semantics,
      };
    }

    const task = await this.tasks.create(input, eventSource);
    return {
      value: task,
      receipt: createReceipt({
        risk: "REVERSIBLE_WRITE",
        action: "tasks.create",
        entityType: "task",
        entityId: task.id,
        summary: `Created task “${task.title}”`,
        undo: { kind: "task.soft_delete", payload: { taskId: task.id } },
      }),
    };
  }

  async createCapturedTask(
    input: CreateTaskInput,
    capture: CaptureCommitContext,
  ): Promise<MutationResult<Task>> {
    if (input.dueDate != null) {
      const resolved = assertResolvedDateTime({
        date: input.dueDate,
        time: input.dueTime,
        timezone: input.dueTimezone,
        semantics: input.dueSemantics,
      });
      input = {
        ...input,
        dueDate: resolved.date,
        dueTime: resolved.time,
        dueTimezone: resolved.timezone,
        dueSemantics: resolved.semantics,
      };
    }
    const task = await this.tasks.create(input, capture.ingress, capture);
    return {
      value: task,
      receipt: createReceipt({
        risk: "REVERSIBLE_WRITE",
        action: "tasks.create",
        entityType: "task",
        entityId: task.id,
        summary: `Created task “${task.title}”`,
        undo: { kind: "task.soft_delete", payload: { taskId: task.id } },
      }),
    };
  }

  async updateTask(
    id: string,
    input: UpdateTaskInput,
    eventSource = "manual",
  ): Promise<MutationResult<Task>> {
    if (input.dueDate !== undefined && input.dueDate != null) {
      const resolved = assertResolvedDateTime({
        date: input.dueDate,
        time: input.dueTime,
        timezone: input.dueTimezone,
        semantics: input.dueSemantics,
      });
      input = {
        ...input,
        dueDate: resolved.date,
        dueTime: resolved.time ?? input.dueTime,
        dueTimezone: resolved.timezone,
        dueSemantics: resolved.semantics,
      };
    }

    const before = await this.tasks.getById(id);
    const task = await this.tasks.update(id, input, eventSource);
    return {
      value: task,
      receipt: createReceipt({
        risk: "REVERSIBLE_WRITE",
        action: "tasks.update",
        entityType: "task",
        entityId: task.id,
        summary: `Updated task “${task.title}”`,
        undo: before
          ? {
              kind: "task.restore_fields",
              payload: {
                taskId: id,
                title: before.title,
                notes: before.notes,
                priority: before.priority,
                projectId: before.projectId,
                dueDate: before.dueDate,
                dueTime: before.dueTime,
                dueTimezone: before.dueTimezone,
                dueSemantics: before.dueSemantics,
              },
            }
          : undefined,
      }),
    };
  }

  async completeTask(
    id: string,
    eventSource = "manual",
  ): Promise<MutationResult<Task>> {
    const task = await this.tasks.complete(id, eventSource);
    return {
      value: task,
      receipt: createReceipt({
        risk: "REVERSIBLE_WRITE",
        action: "tasks.complete",
        entityType: "task",
        entityId: task.id,
        summary: `Completed task “${task.title}”`,
        undo: { kind: "task.reopen", payload: { taskId: task.id } },
      }),
    };
  }

  async reopenTask(
    id: string,
    eventSource = "manual",
  ): Promise<MutationResult<Task>> {
    const task = await this.tasks.reopen(id, eventSource);
    return {
      value: task,
      receipt: createReceipt({
        risk: "REVERSIBLE_WRITE",
        action: "tasks.reopen",
        entityType: "task",
        entityId: task.id,
        summary: `Reopened task “${task.title}”`,
        undo: { kind: "task.complete", payload: { taskId: task.id } },
      }),
    };
  }

  async rescheduleTask(
    id: string,
    input: RescheduleTaskInput,
    eventSource = "manual",
  ): Promise<MutationResult<Task>> {
    const resolved = assertResolvedDateTime({
      date: input.dueDate,
      time: input.dueTime,
      timezone: input.dueTimezone,
      semantics: input.dueSemantics,
    });
    const before = await this.tasks.getById(id);
    const task = await this.tasks.update(
      id,
      {
        dueDate: resolved.date,
        dueTime: resolved.time,
        dueTimezone: resolved.timezone,
        dueSemantics: resolved.semantics,
      },
      eventSource,
    );
    return {
      value: task,
      receipt: createReceipt({
        risk: "REVERSIBLE_WRITE",
        action: "tasks.reschedule",
        entityType: "task",
        entityId: task.id,
        summary: `Rescheduled task “${task.title}” to ${resolved.date}`,
        undo: before
          ? {
              kind: "task.reschedule",
              payload: {
                taskId: id,
                dueDate: before.dueDate,
                dueTime: before.dueTime,
                dueTimezone: before.dueTimezone,
                dueSemantics: before.dueSemantics,
              },
            }
          : undefined,
      }),
    };
  }

  /** Apply schedule-only recovery entries through the repository transaction. */
  async applyRecoverySchedules(
    changes: readonly ConditionalRecoveryScheduleChange[],
    eventSource = "recovery",
  ): Promise<ConditionalTaskScheduleOutcome[]> {
    for (const change of changes) assertRecoverySchedule(change.schedule);
    return this.tasks.applyConditionalScheduleChanges(
      changes.map((change) => ({
        taskId: change.taskId,
        expectedUpdatedAt: change.expectedUpdatedAt,
        dueDate: change.schedule.dueDate!,
        dueTime: change.schedule.dueTime,
        dueTimezone: change.schedule.dueTimezone,
        dueSemantics: change.schedule.dueSemantics,
        eventSource,
      })),
    );
  }

  /** Soft-delete (current product semantics). Returns a receipt suitable for Undo. */
  async deleteTask(
    id: string,
    eventSource = "manual",
  ): Promise<MutationResult<{ id: string }>> {
    const existing = await this.tasks.getById(id);
    await this.tasks.softDelete(id, eventSource);
    return {
      value: { id },
      receipt: createReceipt({
        risk: "REVERSIBLE_WRITE",
        action: "tasks.delete",
        entityType: "task",
        entityId: id,
        summary: existing
          ? `Deleted task “${existing.title}”`
          : `Deleted task ${id}`,
        undo: existing
          ? {
              kind: "task.restore_soft_deleted",
              payload: { taskId: id, snapshot: existing },
            }
          : undefined,
      }),
    };
  }

  async restoreTask(
    id: string,
    eventSource = "undo",
  ): Promise<MutationResult<Task>> {
    const task = await this.tasks.restoreSoftDeleted(id, eventSource);
    return {
      value: task,
      receipt: createReceipt({
        risk: "REVERSIBLE_WRITE",
        action: "tasks.restore",
        entityType: "task",
        entityId: id,
        summary: `Restored task “${task.title}”`,
        undo: { kind: "task.soft_delete", payload: { taskId: id } },
      }),
    };
  }

  async getTask(
    id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<Task | null> {
    return this.tasks.getById(id, options);
  }

  async listTasks(options: ListTasksOptions = {}): Promise<Task[]> {
    const scope = options.scope ?? "active";
    switch (scope) {
      case "today":
        return this.tasks.listToday(options.localDate);
      case "overdue":
        return this.tasks.listOverdue(options.localDate);
      case "upcoming":
        return this.tasks.listUpcoming(options.localDate, options.limit ?? 100);
      case "all":
        return this.tasks.listAll();
      case "all_active":
      case "active":
        if (options.projectId)
          return this.tasks.listByProject(options.projectId);
        if (options.priority)
          return this.tasks.listByPriority(options.priority);
        return this.tasks.listActive({
          limit: options.limit ?? 100,
          completed: options.completed,
        });
      default:
        return this.tasks.listActive({ limit: options.limit ?? 100 });
    }
  }

  async searchTasks(query: string, limit = 50): Promise<Task[]> {
    return this.tasks.search(query, limit);
  }
}
