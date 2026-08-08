import type { Reminder } from '@/domain/entities';
import type { RemindersRepository } from '@/db/repositories/remindersRepository';
import type { TasksRepository } from '@/db/repositories/tasksRepository';

export interface LocalNotificationAdapter {
  list(): Promise<{ identifier: string; reminderId?: string }[]>;
  schedule(input: { reminderId: string; title: string; date: Date }): Promise<string>;
  cancel(identifier: string): Promise<void>;
}

export const expoLocalNotificationAdapter: LocalNotificationAdapter = {
  async list() {
    const Notifications = await import('expo-notifications');
    return (await Notifications.getAllScheduledNotificationsAsync()).map((item) => ({
      identifier: item.identifier,
      reminderId: typeof item.content.data?.reminderId === 'string' ? item.content.data.reminderId : undefined,
    }));
  },
  async schedule(input) {
    const Notifications = await import('expo-notifications');
    const { Platform } = await import('react-native');
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('aether-reminders', {
        name: 'AETHER Reminders',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const permissions = await Notifications.getPermissionsAsync();
    const granted = permissions.granted ? permissions : await Notifications.requestPermissionsAsync();
    if (!granted.granted) throw new Error('Notification permission was denied.');
    return Notifications.scheduleNotificationAsync({
      content: { title: 'AETHER Reminder', body: input.title, data: { reminderId: input.reminderId } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: input.date,
        channelId: 'aether-reminders',
      },
    });
  },
  async cancel(identifier) {
    const Notifications = await import('expo-notifications');
    await Notifications.cancelScheduledNotificationAsync(identifier);
  },
};

function reminderDate(reminder: Reminder): Date {
  if (!reminder.scheduledDate) throw new Error('Reminder has no scheduled date.');
  const value = new Date(`${reminder.scheduledDate}T${reminder.scheduledTime ?? '09:00'}:00`);
  if (!Number.isFinite(value.getTime())) throw new Error('Reminder date is invalid.');
  return value;
}

export class LocalNotificationProjection {
  constructor(
    private readonly reminders: RemindersRepository,
    private readonly tasks: TasksRepository,
    private readonly adapter: LocalNotificationAdapter = expoLocalNotificationAdapter,
  ) {}

  async project(reminder: Reminder): Promise<'scheduled' | 'cancelled'> {
    try {
      if (reminder.nativeNotificationId) await this.adapter.cancel(reminder.nativeNotificationId);
      if (!reminder.enabled) {
        await this.reminders.setProjection(reminder.id, null, null);
        return 'cancelled';
      }
      const task = await this.tasks.getById(reminder.taskId);
      if (!task) throw new Error('Reminder task no longer exists.');
      const nativeId = await this.adapter.schedule({ reminderId: reminder.id, title: task.title, date: reminderDate(reminder) });
      await this.reminders.setProjection(reminder.id, nativeId, null);
      return 'scheduled';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Local notification projection failed.';
      await this.reminders.setProjection(reminder.id, null, message);
      throw new Error(message);
    }
  }

  async reconcile(): Promise<{ repaired: number; failed: number }> {
    const native = await this.adapter.list();
    const nativeByReminder = new Map(native.filter((n) => n.reminderId).map((n) => [n.reminderId!, n.identifier]));
    let repaired = 0;
    let failed = 0;
    const reminders = await this.reminders.listAll();
    const reminderIds = new Set(reminders.map((reminder) => reminder.id));
    for (const item of native) {
      if (!item.reminderId || reminderIds.has(item.reminderId)) continue;
      try {
        await this.adapter.cancel(item.identifier);
        repaired += 1;
      } catch {
        failed += 1;
      }
    }
    for (const reminder of reminders) {
      const actualId = nativeByReminder.get(reminder.id);
      if (!reminder.enabled) {
        const id = actualId ?? reminder.nativeNotificationId;
        if (id) await this.adapter.cancel(id).catch(() => undefined);
        await this.reminders.setProjection(reminder.id, null, null);
        continue;
      }
      if (actualId && actualId === reminder.nativeNotificationId && !reminder.projectionError) continue;
      try { await this.project({ ...reminder, nativeNotificationId: actualId ?? reminder.nativeNotificationId }); repaired += 1; }
      catch { failed += 1; }
    }
    return { repaired, failed };
  }
}

export async function configureLocalNotifications(): Promise<void> {
  const Notifications = await import('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
