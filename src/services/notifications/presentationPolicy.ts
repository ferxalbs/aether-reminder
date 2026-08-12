import type { Reminder } from '@/domain/entities';

/** Shared product semantics; native adapters translate these per platform. */
export type NotificationPresentationPolicy = 'gentle' | 'standard' | 'attention_required';

export interface AndroidPresentationMapping {
  channelId: string;
  channelName: string;
  importance: 'low' | 'default' | 'high';
}

export interface ApplePresentationMapping {
  /** Never timeSensitive/critical for adaptive behavior in v1. */
  interruptionLevel: 'passive' | 'active';
}

export function presentationPolicyForReminder(reminder: Reminder): NotificationPresentationPolicy {
  return reminder.kind === 'adaptive_followup' ? 'gentle' : 'standard';
}

export function mapPresentationPolicyToAndroid(
  policy: NotificationPresentationPolicy,
): AndroidPresentationMapping {
  switch (policy) {
    case 'gentle':
      return {
        channelId: 'aether-adaptive-reminders',
        channelName: 'AETHER Follow-ups',
        importance: 'low',
      };
    case 'attention_required':
      return {
        channelId: 'aether-reminders',
        channelName: 'AETHER Reminders',
        importance: 'high',
      };
    case 'standard':
    default:
      return {
        channelId: 'aether-reminders',
        channelName: 'AETHER Reminders',
        importance: 'high',
      };
  }
}

export function mapPresentationPolicyToApple(
  policy: NotificationPresentationPolicy,
): ApplePresentationMapping {
  return {
    interruptionLevel: policy === 'gentle' ? 'passive' : 'active',
  };
}

