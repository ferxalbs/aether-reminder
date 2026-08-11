import { createRepositories, type Repositories } from '@/db/repositories';
import type { SqlDatabase } from '@/db/types';
import { AnalyticsService } from './analyticsService';
import { RecurrenceService } from './recurrenceService';
import { ReminderService } from './reminderService';
import { TaskService } from './taskService';
import {
  expoLocalNotificationAdapter,
  LocalNotificationProjection,
} from '@/services/notifications/localNotificationProjection';
import { NotificationReconciliationService } from '@/services/notifications/notificationReconciliation';
import { ReliabilityDiagnosticsService } from '@/services/reliability/reliabilityDiagnostics';

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
export { ReliabilityDiagnosticsService } from '@/services/reliability/reliabilityDiagnostics';
export type {
  ReliabilityDiagnostics,
  ReliabilityReconciliationSummary,
} from '@/services/reliability/reliabilityDiagnostics';

export interface DomainServices {
  tasks: TaskService;
  recurrence: RecurrenceService;
  reminders: ReminderService;
  analytics: AnalyticsService;
  notificationProjection: LocalNotificationProjection;
  notifications: NotificationReconciliationService;
  reliability: ReliabilityDiagnosticsService;
  repos: Repositories;
}

export function createDomainServices(db: SqlDatabase): DomainServices {
  const repos = createRepositories(db);
  return createDomainServicesFromRepos(repos);
}

export function createDomainServicesFromRepos(repos: Repositories): DomainServices {
  const tasks = new TaskService(repos.tasks);
  const notificationProjection = new LocalNotificationProjection(
    repos.reminders,
    repos.tasks,
    expoLocalNotificationAdapter,
  );
  const notifications = new NotificationReconciliationService(
    repos.reminders,
    repos.tasks,
    notificationProjection,
    expoLocalNotificationAdapter,
    repos.appMeta,
  );
  const reminders = new ReminderService(repos.reminders, notificationProjection);
  const reliability = new ReliabilityDiagnosticsService(
    repos.db,
    repos.reminders,
    repos.appMeta,
    notificationProjection,
    expoLocalNotificationAdapter,
  );
  return {
    tasks,
    recurrence: new RecurrenceService(repos.recurrenceRules, tasks, reminders),
    reminders,
    analytics: new AnalyticsService(repos.tasks),
    notificationProjection,
    notifications,
    reliability,
    repos,
  };
}
