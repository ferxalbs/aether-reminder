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

export function createDomainServices(dbOrRepos?: SqlDatabase | Repositories): DomainServices {
  const repos =
    dbOrRepos && 'tasks' in dbOrRepos && typeof (dbOrRepos as Repositories).tasks.getById === 'function'
      ? (dbOrRepos as Repositories)
      : createRepositories(dbOrRepos as SqlDatabase | undefined);

  return {
    tasks: new TaskService(repos.tasks),
    reminders: new ReminderService(repos.reminders),
    analytics: new AnalyticsService(repos.tasks),
    repos,
  };
}
