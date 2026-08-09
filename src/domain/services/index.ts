import { createRepositories, type Repositories } from '@/db/repositories';
import type { SqlDatabase } from '@/db/types';
import { AnalyticsService } from './analyticsService';
import { RecurrenceService } from './recurrenceService';
import { ReminderService } from './reminderService';
import { TaskService } from './taskService';
import { LocalNotificationProjection } from '@/services/notifications/localNotificationProjection';

export { TaskService } from './taskService';
export type { ListTasksOptions, RescheduleTaskInput, MutationResult, TaskListScope } from './taskService';
export { RecurrenceService } from './recurrenceService';
export type {
  RecurrenceMutationResult,
  RecurrenceAdvanceResult,
  CreateRecurringTaskInput,
} from './recurrenceService';
export { ReminderService } from './reminderService';
export type {
  ScheduleReminderInput,
  RescheduleReminderInput,
  ReminderMutationResult,
} from './reminderService';
export { AnalyticsService } from './analyticsService';
export type { WorkloadSnapshot } from './analyticsService';

export interface DomainServices {
  tasks: TaskService;
  recurrence: RecurrenceService;
  reminders: ReminderService;
  analytics: AnalyticsService;
  repos: Repositories;
}

export function createDomainServices(db: SqlDatabase): DomainServices {
  const repos = createRepositories(db);
  return createDomainServicesFromRepos(repos);
}

export function createDomainServicesFromRepos(repos: Repositories): DomainServices {
  const tasks = new TaskService(repos.tasks);
  const reminders = new ReminderService(
    repos.reminders,
    new LocalNotificationProjection(repos.reminders, repos.tasks),
  );
  return {
    tasks,
    recurrence: new RecurrenceService(repos.recurrenceRules, tasks, reminders),
    reminders,
    analytics: new AnalyticsService(repos.tasks),
    repos,
  };
}
