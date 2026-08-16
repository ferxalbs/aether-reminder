export {
  initializeDatabase,
  getDatabase,
  isDatabaseReady,
  getDatabaseInitError,
  recoverDatabase,
  assertDatabaseIntegrity,
  initializeDatabaseWith,
  __setDatabaseForTests,
  DATABASE_NAME,
  RECREATE_DATABASE_CONFIRMATION,
} from "./client";
export type { DatabaseRecoveryMode, DatabaseRecoveryResult } from "./client";
export { bootstrapAppData } from "./bootstrap";
export type { BootstrapResult } from "./bootstrap";
export { DatabaseError, getDatabaseErrorMessage } from "./errors";
export {
  createRepositories,
  AppMetaRepository,
  NotificationActionReceiptsRepository,
  TasksRepository,
  RecurrenceRulesRepository,
  RemindersRepository,
  ProjectsRepository,
  TaskEventsRepository,
  AgentRuntimeRepository,
} from "./repositories";
export type { Repositories } from "./repositories";
export {
  migrateLegacyTasks,
  LEGACY_TASKS_STORAGE_KEY,
  KNOWN_DEMO_TASK_IDS,
  normalizeLegacyTask,
} from "./legacyMigration";
export type { LegacyMigrationResult } from "./legacyMigration";
export { LATEST_SCHEMA_VERSION } from "./migrations";
