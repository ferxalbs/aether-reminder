import {
  NotificationError,
  toNotificationError,
} from './errors';
import type {
  NotificationReconciliationOptions,
  NotificationReconciliationResult,
} from './notificationReconciliation';

export interface NotificationSyncClient {
  configure: () => Promise<void>;
  reconcile: (options?: NotificationReconciliationOptions) => Promise<NotificationReconciliationResult>;
}

export async function syncLocalNotifications(
  client: NotificationSyncClient,
  options: NotificationReconciliationOptions = { mode: 'full', reason: 'cold-start' },
): Promise<NotificationReconciliationResult> {
  try {
    await client.configure();
  } catch (error) {
    throw toNotificationError(
      error,
      'CONFIGURATION_FAILED',
      'Local notifications could not be initialized. Try again.',
    );
  }

  let result: NotificationReconciliationResult;
  try {
    result = await client.reconcile(options);
  } catch (error) {
    throw toNotificationError(
      error,
      'RECONCILIATION_FAILED',
      'Reminders could not be synchronized with device notifications. Try again.',
    );
  }

  if (result.failed > 0) {
    throw new NotificationError(
      'RECONCILIATION_FAILED',
      result.failed === 1
        ? 'One reminder could not be synchronized with device notifications. Try again.'
        : `${result.failed} reminders could not be synchronized with device notifications. Try again.`,
      true,
      result.failures,
    );
  }

  return result;
}
