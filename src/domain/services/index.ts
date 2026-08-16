import { createRepositories, type Repositories } from "@/db/repositories";
import type { SqlDatabase } from "@/db/types";
import { AnalyticsService } from "./analyticsService";
import { RecurrenceService } from "./recurrenceService";
import { ReminderService } from "./reminderService";
import { TaskService } from "./taskService";
import { RecoveryService } from "./recoveryService";
import { NudgeService } from "./nudgeService";
import { AttentionService } from "./attentionService";
import {
  expoLocalNotificationAdapter,
  LocalNotificationProjection,
} from "@/services/notifications/localNotificationProjection";
import { NotificationReconciliationService } from "@/services/notifications/notificationReconciliation";
import { ReliabilityDiagnosticsService } from "@/services/reliability/reliabilityDiagnostics";

export { TaskService } from "./taskService";
export type {
  ListTasksOptions,
  RescheduleTaskInput,
  MutationResult,
  TaskListScope,
  ConditionalRecoveryScheduleChange,
} from "./taskService";
export { RecurrenceService } from "./recurrenceService";
export type {
  RecurrenceMutationResult,
  RecurrenceAdvanceResult,
  CreateRecurringTaskInput,
} from "./recurrenceService";
export { ReminderService } from "./reminderService";
export type {
  ScheduleReminderInput,
  RescheduleReminderInput,
  ReminderMutationResult,
  ReminderMutationOptions,
} from "./reminderService";
export { AnalyticsService } from "./analyticsService";
export type { WorkloadSnapshot } from "./analyticsService";
export { ReliabilityDiagnosticsService } from "@/services/reliability/reliabilityDiagnostics";
export type {
  ReliabilityDiagnostics,
  ReliabilityReconciliationSummary,
} from "@/services/reliability/reliabilityDiagnostics";
export { RecoveryService } from "./recoveryService";
export type { RecoveryBuildContext } from "./recoveryService";
export { NudgeService } from "./nudgeService";
export type {
  NudgeDiagnostics,
  NotificationNudgeAction,
  NotificationNudgeActionInput,
  NotificationNudgeOpenedInput,
} from "./nudgeService";
export { AttentionService } from "./attentionService";
export type { AttentionPlanOptions } from "./attentionService";
export type { ReliabilityAttentionState } from "@/services/reliability/reliabilityDiagnostics";

export interface DomainServices {
  tasks: TaskService;
  recovery: RecoveryService;
  nudges: NudgeService;
  attention: AttentionService;
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

export function createDomainServicesFromRepos(
  repos: Repositories,
): DomainServices {
  const tasks = new TaskService(repos.tasks, repos.captureCommits);
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
  const reminders = new ReminderService(
    repos.reminders,
    notificationProjection,
  );
  const nudges = new NudgeService(
    repos.tasks,
    repos.reminders,
    repos.nudgeEvents,
    repos.appMeta,
    notificationProjection,
  );
  const reliability = new ReliabilityDiagnosticsService(
    repos.db,
    repos.reminders,
    repos.appMeta,
    notificationProjection,
    expoLocalNotificationAdapter,
  );
  const attention = new AttentionService(
    repos.tasks,
    nudges,
    reliability,
    repos.appMeta,
  );
  return {
    tasks,
    recovery: new RecoveryService(repos.tasks, repos.recurrenceRules),
    nudges,
    attention,
    recurrence: new RecurrenceService(repos.recurrenceRules, tasks, reminders),
    reminders,
    analytics: new AnalyticsService(repos.tasks),
    notificationProjection,
    notifications,
    reliability,
    repos,
  };
}
