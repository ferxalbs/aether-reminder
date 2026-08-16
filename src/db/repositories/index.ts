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
  return {
    db,
    tasks: new TasksRepository(db),
    recurrenceRules: new RecurrenceRulesRepository(db),
    reminders: new RemindersRepository(db),
    appMeta: new AppMetaRepository(db),
    notificationActions: new NotificationActionReceiptsRepository(db),
    projects: new ProjectsRepository(db),
    taskEvents: new TaskEventsRepository(db),
    agentRuntime: new AgentRuntimeRepository(db),
    nudgeEvents: new NudgeEventsRepository(db),
    captureCommits: new CaptureCommitsRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
