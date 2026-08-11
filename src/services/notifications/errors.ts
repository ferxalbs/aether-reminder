export type NotificationErrorCode =
  | 'CONFIGURATION_FAILED'
  | 'PERMISSION_DENIED'
  | 'CHANNEL_UNAVAILABLE'
  | 'EXACT_TIMING_UNAVAILABLE'
  | 'INVALID_TRIGGER'
  | 'NATIVE_NOTIFICATION_MISSING'
  | 'PERSISTENCE_FAILED'
  | 'RECONCILIATION_FAILED'
  | 'PROJECTION_FAILED';

export class NotificationError extends Error {
  constructor(
    public readonly code: NotificationErrorCode,
    message: string,
    public readonly retryable = true,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NotificationError';
  }
}

export function toNotificationError(
  error: unknown,
  code: NotificationErrorCode,
  fallbackMessage: string,
): NotificationError {
  if (error instanceof NotificationError) return error;

  const rawMessage = error instanceof Error ? error.message : '';
  if (/permission|not granted|denied/i.test(rawMessage)) {
    return new NotificationError(
      'PERMISSION_DENIED',
      'Notifications are disabled. Enable them in system settings, then retry.',
      true,
      error,
    );
  }

  return new NotificationError(code, fallbackMessage, true, error);
}

export function getNotificationErrorMessage(error: unknown): string {
  if (error instanceof NotificationError) return error.message;
  return 'Reminders could not be synchronized with device notifications. Try again.';
}
