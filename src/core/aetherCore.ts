import type { SqlDatabase } from "@/db/types";
import { createDomainServices, type DomainServices } from "@/domain/services";
import {
  AetherAgentRuntime,
  type AetherAgentRuntimeOptions,
} from "@/services/agent/runtime";
import { cloudToolRegistry } from "@/services/agent/tools";
import { aetherCloudInferenceProvider } from "@/services/ai/inference";
import { isAetherCloudConfigured } from "@/services/cloud";
import type { NotificationReconciliationOptions } from "@/services/notifications/notificationReconciliation";
import { AetherCommandExecutor } from "./commands";

export interface AetherCoreOptions extends Omit<
  AetherAgentRuntimeOptions,
  "services" | "commands"
> {
  services?: DomainServices;
}

/** In-process application execution boundary. This is not a transport or server. */
export class AetherCore {
  readonly services: DomainServices;
  readonly commands: AetherCommandExecutor;
  readonly agent: AetherAgentRuntime;

  constructor(options: AetherCoreOptions) {
    this.services = options.services ?? createDomainServices(options.db);
    this.commands = new AetherCommandExecutor(this.services);
    this.agent = new AetherAgentRuntime({
      ...options,
      services: this.services,
      commands: this.commands,
    });
  }

  reconcileNotifications(
    options: NotificationReconciliationOptions = {
      mode: "full",
      reason: "legacy",
    },
  ) {
    return this.services.notifications.reconcile(options);
  }
}

let appCore: AetherCore | null = null;
let appCoreDatabase: SqlDatabase | null = null;

export function getAetherCore(db: SqlDatabase): AetherCore {
  if (!appCore || appCoreDatabase !== db) {
    const hosted = isAetherCloudConfigured();
    appCore = new AetherCore({
      db,
      ...(hosted
        ? {
            provider: aetherCloudInferenceProvider,
            tools: cloudToolRegistry,
          }
        : {}),
    });
    appCoreDatabase = db;
  }
  return appCore;
}

export function resetAetherCoreForTests(): void {
  appCore = null;
  appCoreDatabase = null;
}
