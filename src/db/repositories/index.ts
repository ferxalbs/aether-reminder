import type { SqlDatabase } from "../types";
import { AgentRuntimeRepository } from "./agentRuntimeRepository";
import { AppMetaRepository } from "./appMetaRepository";
import { NotificationActionReceiptsRepository } from "./notificationActionReceiptsRepository";
import { ProjectsRepository } from "./projectsRepository";
import { RecurrenceRulesRepository } from "./recurrenceRulesRepository";
import { RemindersRepository } from "./remindersRepository";
import { TaskEventsRepository } from "./taskEventsRepository";
import { TasksRepository } from "./tasksRepository";
import { NudgeEventsRepository } from "./nudgeEventsRepository";
import { CaptureCommitsRepository } from "./captureCommitsRepository";
import { SyncOutboxRepository } from "./syncOutboxRepository";

export { AppMetaRepository } from "./appMetaRepository";
export { NotificationActionReceiptsRepository } from "./notificationActionReceiptsRepository";
export { ProjectsRepository } from "./projectsRepository";
export { RecurrenceRulesRepository } from "./recurrenceRulesRepository";
export { RemindersRepository } from "./remindersRepository";
export { TaskEventsRepository } from "./taskEventsRepository";
export { TasksRepository } from "./tasksRepository";
export { NudgeEventsRepository } from "./nudgeEventsRepository";
export { CaptureCommitsRepository } from "./captureCommitsRepository";
export {
  SyncOutboxRepository,
  SYNC_PULL_LIMIT,
  SYNC_PUSH_BATCH_LIMIT,
  SYNC_MUTATION_PAYLOAD_LIMIT_BYTES,
  SYNC_REQUEST_LIMIT_BYTES,
} from "./syncOutboxRepository";
export type {
  SyncEntityState,
  SyncOutboxRow,
  SyncScope,
} from "./syncOutboxRepository";
export {
  AgentRuntimeRepository,
  hashArgs,
  buildIdempotencyKey,
} from "./agentRuntimeRepository";

/**
 * Build repositories for an explicit SqlDatabase.
 * Callers that need the app singleton should pass `getDatabase()` from `@/db/client`
 * (lazy) so unit tests never load expo-sqlite via this module.
 */
export function createRepositories(db: SqlDatabase) {
  const sync = new SyncOutboxRepository(db);
  return {
    db,
    sync,
    tasks: new TasksRepository(db, sync),
    recurrenceRules: new RecurrenceRulesRepository(db, sync),
    reminders: new RemindersRepository(db, sync),
    appMeta: new AppMetaRepository(db),
    notificationActions: new NotificationActionReceiptsRepository(db),
    projects: new ProjectsRepository(db),
    taskEvents: new TaskEventsRepository(db),
    agentRuntime: new AgentRuntimeRepository(db),
    nudgeEvents: new NudgeEventsRepository(db),
    captureCommits: new CaptureCommitsRepository(db, sync),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
