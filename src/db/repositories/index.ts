import type { SqlDatabase } from '../types';
import { AgentRuntimeRepository } from './agentRuntimeRepository';
import { ProjectsRepository } from './projectsRepository';
import { RecurrenceRulesRepository } from './recurrenceRulesRepository';
import { RemindersRepository } from './remindersRepository';
import { TaskEventsRepository } from './taskEventsRepository';
import { TasksRepository } from './tasksRepository';

export { ProjectsRepository } from './projectsRepository';
export { RecurrenceRulesRepository } from './recurrenceRulesRepository';
export { RemindersRepository } from './remindersRepository';
export { TaskEventsRepository } from './taskEventsRepository';
export { TasksRepository } from './tasksRepository';
export {
  AgentRuntimeRepository,
  hashArgs,
  buildIdempotencyKey,
} from './agentRuntimeRepository';

/**
 * Build repositories for an explicit SqlDatabase.
 * Callers that need the app singleton should pass `getDatabase()` from `@/db/client`
 * (lazy) so unit tests never load expo-sqlite via this module.
 */
export function createRepositories(db: SqlDatabase) {
  return {
    tasks: new TasksRepository(db),
    recurrenceRules: new RecurrenceRulesRepository(db),
    reminders: new RemindersRepository(db),
    projects: new ProjectsRepository(db),
    taskEvents: new TaskEventsRepository(db),
    agentRuntime: new AgentRuntimeRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
