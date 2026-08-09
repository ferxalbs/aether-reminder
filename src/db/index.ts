export {
  initializeDatabase,
  getDatabase,
  isDatabaseReady,
  getDatabaseInitError,
  initializeDatabaseWith,
  __setDatabaseForTests,
  DATABASE_NAME,
} from './client';
export { bootstrapAppData } from './bootstrap';
export type { BootstrapResult } from './bootstrap';
export { DatabaseError, getDatabaseErrorMessage } from './errors';
export {
  createRepositories,
  TasksRepository,
  RecurrenceRulesRepository,
  RemindersRepository,
  ProjectsRepository,
  TaskEventsRepository,
  AgentRuntimeRepository,
} from './repositories';
export type { Repositories } from './repositories';
export {
  migrateLegacyTasks,
  LEGACY_TASKS_STORAGE_KEY,
  KNOWN_DEMO_TASK_IDS,
  normalizeLegacyTask,
} from './legacyMigration';
export type { LegacyMigrationResult } from './legacyMigration';
export { LATEST_SCHEMA_VERSION } from './migrations';
