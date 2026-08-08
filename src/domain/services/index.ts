import { createRepositories, type Repositories } from '@/db/repositories';
import type { SqlDatabase } from '@/db/types';
import { AnalyticsService } from './analyticsService';
import { ReminderService } from './reminderService';
import { TaskService } from './taskService';

export { TaskService } from './taskService';
export type { ListTasksOptions, RescheduleTaskInput, MutationResult, TaskListScope } from './taskService';
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
  reminders: ReminderService;
  analytics: AnalyticsService;
  repos: Repositories;
}

export function createDomainServices(db: SqlDatabase): DomainServices {
  const repos = createRepositories(db);
  return createDomainServicesFromRepos(repos);
}

export function createDomainServicesFromRepos(repos: Repositories): DomainServices {
  return {
    tasks: new TaskService(repos.tasks),
    reminders: new ReminderService(repos.reminders),
    analytics: new AnalyticsService(repos.tasks),
    repos,
  };
}
