import type { CreateTaskInput, UpdateTaskInput } from '@/domain/entities';
import type { DomainServices } from '@/domain/services';
import type { RescheduleTaskInput } from '@/domain/services/taskService';
import type {
  RescheduleReminderInput,
  ScheduleReminderInput,
} from '@/domain/services/reminderService';

/**
 * The shared mutation path for UI, agent tools, and native actions.
 * Business rules remain in domain services; this class only owns dispatch.
 */
export class AetherCommandExecutor {
  constructor(private readonly services: DomainServices) {}

  createTask(input: CreateTaskInput, source = 'manual') {
    return this.services.tasks.createTask(input, source);
  }

  updateTask(id: string, input: UpdateTaskInput, source = 'manual') {
    return this.services.tasks.updateTask(id, input, source);
  }

  completeTask(id: string, source = 'manual') {
    return this.services.tasks.completeTask(id, source);
  }

  reopenTask(id: string, source = 'manual') {
    return this.services.tasks.reopenTask(id, source);
  }

  rescheduleTask(id: string, input: RescheduleTaskInput, source = 'manual') {
    return this.services.tasks.rescheduleTask(id, input, source);
  }

  deleteTask(id: string, source = 'manual') {
    return this.services.tasks.deleteTask(id, source);
  }

  scheduleReminder(input: ScheduleReminderInput, source = 'manual') {
    return this.services.reminders.scheduleReminder(input, source);
  }

  rescheduleReminder(id: string, input: RescheduleReminderInput) {
    return this.services.reminders.rescheduleReminder(id, input);
  }

  cancelReminder(id: string) {
    return this.services.reminders.cancelReminder(id);
  }
}
