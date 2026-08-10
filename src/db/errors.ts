export type DatabaseErrorCode =
  | 'INIT_FAILED'
  | 'NOT_READY'
  | 'MIGRATION_FAILED'
  | 'MIGRATION_PARTIAL'
  | 'QUERY_FAILED'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'LEGACY_MIGRATION_FAILED'
  | 'LEGACY_MIGRATION_INCOMPLETE'
  | 'TRANSACTION_FAILED'
  | 'INTEGRITY_CHECK_FAILED'
  | 'RECOVERY_FAILED'
  | 'RECOVERY_CONFIRMATION_REQUIRED'
  | 'RECOVERY_IN_PROGRESS'
  | 'UNKNOWN';

export class DatabaseError extends Error {
  readonly code: DatabaseErrorCode;
  readonly causeError?: unknown;

  constructor(code: DatabaseErrorCode, message: string, causeError?: unknown) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    this.causeError = causeError;
  }
}

export function getDatabaseErrorMessage(error: unknown): string {
  if (error instanceof DatabaseError) {
    switch (error.code) {
      case 'INIT_FAILED':
        return 'Could not open the local database.';
      case 'NOT_READY':
        return 'Database is not ready yet.';
      case 'MIGRATION_FAILED':
        return 'Database upgrade failed. Your data was not partially applied.';
      case 'LEGACY_MIGRATION_FAILED':
        return 'Could not import previous tasks. Existing data was left unchanged.';
      case 'INTEGRITY_CHECK_FAILED':
        return 'The local database did not pass its integrity check.';
      case 'RECOVERY_FAILED':
        return 'Database recovery did not complete. Retry recovery before continuing.';
      case 'RECOVERY_CONFIRMATION_REQUIRED':
        return 'Database recreation requires confirmation.';
      case 'RECOVERY_IN_PROGRESS':
        return 'Database recovery is already in progress.';
      case 'NOT_FOUND':
        return 'That item was not found.';
      case 'VALIDATION_FAILED':
        return 'Invalid data was rejected.';
      default:
        return 'A database error occurred.';
    }
  }
  return 'A database error occurred.';
}
