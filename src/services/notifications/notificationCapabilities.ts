import type { ReminderTimingPrecision } from '@/domain/entities';
import { NotificationError } from './errors';

export type NotificationCapabilityStatus = 'available' | 'unavailable' | 'unknown';
export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unknown';

export interface NotificationCapabilities {
  permission: NotificationPermissionStatus;
  channel: NotificationCapabilityStatus;
  exactTiming: NotificationCapabilityStatus;
}

export function assertTimingCapability(
  precision: ReminderTimingPrecision,
  capabilities: NotificationCapabilities,
): void {
  if (precision !== 'exact') return;
  if (capabilities.exactTiming === 'available') return;
  throw new NotificationError(
    'EXACT_TIMING_UNAVAILABLE',
    'Exact reminder timing is not available on this device.',
  );
}

export function defaultNotificationCapabilities(): NotificationCapabilities {
  return {
    permission: 'granted',
    channel: 'available',
    exactTiming: 'available',
  };
}
