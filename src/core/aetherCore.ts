import type { SqlDatabase } from '@/db/types';
import { createDomainServices, type DomainServices } from '@/domain/services';
import {
  AetherAgentRuntime,
  type AetherAgentRuntimeOptions,
} from '@/services/agent/runtime';
import { LocalNotificationProjection } from '@/services/notifications/localNotificationProjection';
import { AetherCommandExecutor } from './commands';

export interface AetherCoreOptions
  extends Omit<AetherAgentRuntimeOptions, 'services' | 'commands'> {
  services?: DomainServices;
}

/** In-process application execution boundary. This is not a transport or server. */
export class AetherCore {
  readonly services: DomainServices;
  readonly commands: AetherCommandExecutor;
  readonly agent: AetherAgentRuntime;
  private readonly notifications: LocalNotificationProjection;

  constructor(options: AetherCoreOptions) {
    this.services = options.services ?? createDomainServices(options.db);
    this.commands = new AetherCommandExecutor(this.services);
    this.agent = new AetherAgentRuntime({
      ...options,
      services: this.services,
      commands: this.commands,
    });
    this.notifications = new LocalNotificationProjection(
      this.services.repos.reminders,
      this.services.repos.tasks,
    );
  }

  reconcileNotifications() {
    return this.notifications.reconcile();
  }
}

let appCore: AetherCore | null = null;

export function getAetherCore(db: SqlDatabase): AetherCore {
  appCore ??= new AetherCore({ db });
  return appCore;
}

export function resetAetherCoreForTests(): void {
  appCore = null;
}
