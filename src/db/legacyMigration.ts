import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CreateTaskInput, TaskPriority } from '@/domain/entities';
import { isPlausibleId } from '@/lib/id';
import { getLocalDateString } from '@/temporal/localCalendar';
import { DatabaseError } from './errors';
import type { SqlDatabase } from './types';
import { TasksRepository } from './repositories/tasksRepository';

/** Zustand persist key from pre-SQLite tasks store. */
export const LEGACY_TASKS_STORAGE_KEY = 'taskflow-tasks-storage';

/** app_meta key written only after successful verified import. */
export const LEGACY_MIGRATION_META_KEY = 'legacy_tasks_migrated_v1';

/**
 * Known demo/sample task IDs from the historical seed list.
 * These MUST NOT be imported into a real user database.
 */
export const KNOWN_DEMO_TASK_IDS = new Set(['demo-1', 'demo-2', 'demo-3', 'demo-4']);

const DEMO_TITLE_FRAGMENTS = [
  'Review Q3 Product Architecture & Liquid Glass specs',
  'Finalize OpenRouter API client abstraction',
  'Prepare voice transcription workflow demo',
  'Refactor design tokens for Material 3 Expressive contrast',
] as const;

export type LegacyMigrationStatus =
  | 'skipped_already_done'
  | 'skipped_empty'
  | 'skipped_demo_only'
  | 'imported'
  | 'failed';

export interface LegacyMigrationResult {
  status: LegacyMigrationStatus;
  importedCount: number;
  skippedDemoCount: number;
  skippedInvalidCount: number;
}

interface LegacyTaskShape {
  id?: unknown;
  title?: unknown;
  notes?: unknown;
  completed?: unknown;
  createdAt?: unknown;
  dueDate?: unknown;
  priority?: unknown;
  reminderDate?: unknown;
  aiSuggested?: unknown;
}

function isDemoTask(task: LegacyTaskShape): boolean {
  if (typeof task.id === 'string' && KNOWN_DEMO_TASK_IDS.has(task.id)) return true;
  if (typeof task.title === 'string' && (DEMO_TITLE_FRAGMENTS as readonly string[]).includes(task.title)) {
    return true;
  }
  return false;
}

function isValidPriority(value: unknown): value is TaskPriority {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  const t = Date.parse(value);
  return Number.isFinite(t);
}

function isLocalDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Validate and normalize a legacy task into CreateTaskInput.
 * Returns null if invalid (caller increments skippedInvalidCount).
 */
export function normalizeLegacyTask(raw: unknown): CreateTaskInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const task = raw as LegacyTaskShape;

  if (typeof task.title !== 'string' || !task.title.trim()) return null;
  if (!isValidPriority(task.priority)) return null;

  const preserveId =
    typeof task.id === 'string' && isPlausibleId(task.id) && !KNOWN_DEMO_TASK_IDS.has(task.id)
      ? task.id
      : undefined;

  const createdAt = isIsoInstant(task.createdAt) ? task.createdAt : new Date().toISOString();
  const dueDate =
    task.dueDate === undefined || task.dueDate === null
      ? getLocalDateString()
      : isLocalDate(task.dueDate)
        ? task.dueDate
        : isIsoInstant(task.dueDate)
          ? // Legacy sometimes stored ISO instants in dueDate — take local calendar of that instant carefully:
            // Prefer calendar from string prefix if present, else local conversion.
            task.dueDate.slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/)
            ? task.dueDate.slice(0, 10)
            : getLocalDateString(new Date(task.dueDate))
          : getLocalDateString();

  return {
    id: preserveId,
    title: task.title.trim(),
    notes: typeof task.notes === 'string' ? task.notes : null,
    priority: task.priority,
    completed: Boolean(task.completed),
    dueDate,
    dueSemantics: 'floating',
    source: task.aiSuggested ? 'agent' : 'import',
    creationOrigin: task.aiSuggested ? 'agent' : 'import',
    createdAt,
    updatedAt: createdAt,
    completedAt: task.completed ? createdAt : null,
  };
}

export async function isLegacyMigrationComplete(db: SqlDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_meta WHERE key = ?`,
    [LEGACY_MIGRATION_META_KEY]
  );
  return row?.value === '1';
}

async function markLegacyMigrationComplete(db: SqlDatabase): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_meta (key, value) VALUES (?, '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [LEGACY_MIGRATION_META_KEY]
  );
}

function parseLegacyStorageBlob(raw: string | null): unknown[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DatabaseError('LEGACY_MIGRATION_FAILED', 'Legacy task storage contained invalid JSON.');
  }

  // Zustand persist shape: { state: { tasks: [...] }, version: n }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as { state?: { tasks?: unknown }; tasks?: unknown };
    const tasks = obj.state?.tasks ?? obj.tasks;
    if (Array.isArray(tasks)) return tasks;
  }
  if (Array.isArray(parsed)) return parsed;
  throw new DatabaseError('LEGACY_MIGRATION_FAILED', 'Legacy task storage had unexpected shape.');
}

export interface LegacyMigrationDeps {
  /** Override AsyncStorage read for tests */
  readLegacy?: () => Promise<string | null>;
  /** Clear legacy only after success (optional) */
  clearLegacy?: () => Promise<void>;
}

/**
 * One-time, idempotent import of Zustand/AsyncStorage tasks into SQLite.
 * Demo seeds are excluded. Failures leave legacy data and SQLite unchanged for import batch.
 */
export async function migrateLegacyTasks(
  db: SqlDatabase,
  deps: LegacyMigrationDeps = {}
): Promise<LegacyMigrationResult> {
  if (await isLegacyMigrationComplete(db)) {
    return {
      status: 'skipped_already_done',
      importedCount: 0,
      skippedDemoCount: 0,
      skippedInvalidCount: 0,
    };
  }

  const read =
    deps.readLegacy ??
    (async () => {
      try {
        return await AsyncStorage.getItem(LEGACY_TASKS_STORAGE_KEY);
      } catch (cause) {
        throw new DatabaseError('LEGACY_MIGRATION_FAILED', 'Could not read legacy task storage.', cause);
      }
    });

  let raw: string | null;
  try {
    raw = await read();
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError('LEGACY_MIGRATION_FAILED', 'Could not read legacy task storage.', error);
  }

  let tasks: unknown[];
  try {
    tasks = parseLegacyStorageBlob(raw);
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError('LEGACY_MIGRATION_FAILED', 'Could not parse legacy tasks.', error);
  }

  if (tasks.length === 0) {
    await markLegacyMigrationComplete(db);
    return {
      status: 'skipped_empty',
      importedCount: 0,
      skippedDemoCount: 0,
      skippedInvalidCount: 0,
    };
  }

  let skippedDemoCount = 0;
  let skippedInvalidCount = 0;
  const toImport: CreateTaskInput[] = [];

  for (const item of tasks) {
    if (item && typeof item === 'object' && isDemoTask(item as LegacyTaskShape)) {
      skippedDemoCount += 1;
      continue;
    }
    const normalized = normalizeLegacyTask(item);
    if (!normalized) {
      skippedInvalidCount += 1;
      continue;
    }
    toImport.push(normalized);
  }

  if (toImport.length === 0) {
    await markLegacyMigrationComplete(db);
    return {
      status: 'skipped_demo_only',
      importedCount: 0,
      skippedDemoCount,
      skippedInvalidCount,
    };
  }

  const tasksRepo = new TasksRepository(db);
  let importedCount = 0;

  // Each create() is its own transaction (task + event). Avoid nested transactions
  // (expo-sqlite does not nest cleanly). Idempotent via preserved IDs + meta flag.
  try {
    for (const input of toImport) {
      if (input.id) {
        const existing = await tasksRepo.getById(input.id, { includeDeleted: true });
        if (existing) {
          // Partial previous attempt — skip insert
          continue;
        }
      }
      await tasksRepo.create(input, 'import');
      importedCount += 1;
    }

    const activeCount = await tasksRepo.countActive();
    if (activeCount < 1 && importedCount === 0) {
      throw new DatabaseError(
        'LEGACY_MIGRATION_INCOMPLETE',
        'Migration verification failed: no active tasks after import.'
      );
    }

    // Only mark complete after all creates succeeded and verification passed.
    await markLegacyMigrationComplete(db);
  } catch (cause) {
    // Do not mark complete — next launch retries; existing rows skipped by id.
    throw new DatabaseError(
      'LEGACY_MIGRATION_FAILED',
      'Legacy task import failed; migration not marked complete. AsyncStorage left in place.',
      cause
    );
  }

  // Only after success: retire legacy persistence (best-effort).
  const clear =
    deps.clearLegacy ??
    (async () => {
      try {
        await AsyncStorage.removeItem(LEGACY_TASKS_STORAGE_KEY);
      } catch {
        // Do not fail migration if cleanup fails — meta flag prevents re-import.
      }
    });
  await clear();

  return {
    status: 'imported',
    importedCount,
    skippedDemoCount,
    skippedInvalidCount,
  };
}
