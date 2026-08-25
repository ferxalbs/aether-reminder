import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, AppState, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { bootstrapAppData } from "@/db/bootstrap";
import {
  getDatabase,
  recoverDatabase,
  RECREATE_DATABASE_CONFIRMATION,
  type DatabaseRecoveryMode,
} from "@/db";
import { configureLocalNotifications } from "@/services/notifications/localNotificationProjection";
import { registerNotificationActionListener } from "@/services/notifications/notificationActions";
import {
  getNotificationErrorMessage,
  NotificationError,
} from "@/services/notifications/errors";
import { syncLocalNotifications } from "@/services/notifications/notificationBootstrap";
import type { NotificationReconciliationOptions } from "@/services/notifications/notificationReconciliation";
import { getDeviceTimeZone } from "@/temporal/localCalendar";
import { getAetherCore } from "@/core";
import { getDatabaseErrorMessage } from "@/db/errors";
import { useSettingsStore } from "@/stores/settings.store";
import { useTasksUiStore } from "@/stores/tasksUi.store";
import { useAetherTheme } from "@/theme/useAetherTheme";
import {
  AetherAlertDialog,
  type AetherAlertDialogState,
} from "@/components/ui/AetherAlertDialog";
import { Typography } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { NotificationSyncBanner } from "@/components/ui/NotificationSyncBanner";
import { reportNonFatalError } from "@/lib/nonFatalError";
import {
  addNativeCaptureListener,
  drainCaptureInbox,
  getPendingNativeCaptureId,
  initializeCaptureInbox,
} from "@/services/capture";

export type LocalBootstrapPhase = "loading" | "ready" | "error";

type NotificationSyncState = {
  phase: "idle" | "syncing" | "ready" | "error";
  message?: string;
};

export type LocalAppBootstrapState = {
  phase: LocalBootstrapPhase;
  errorMessage: string | null;
  syncNotifications: (
    options?: NotificationReconciliationOptions,
  ) => Promise<void>;
};

const LocalAppBootstrapContext = createContext<LocalAppBootstrapState | null>(
  null,
);

export function useLocalAppBootstrap(): LocalAppBootstrapState {
  const state = useContext(LocalAppBootstrapContext);
  if (!state) {
    throw new Error("useLocalAppBootstrap must be used inside AppBootstrap.");
  }
  return state;
}

function useLocalAppBootstrapState(): LocalAppBootstrapState & {
  notificationSync: NotificationSyncState;
  alertDialog: AetherAlertDialogState | null;
  dismissAlertDialog: () => void;
  retryDatabase: () => Promise<void>;
  checkDatabaseIntegrity: () => Promise<void>;
  confirmDatabaseRecreation: () => void;
} {
  const router = useRouter();
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const setAdaptiveNudgesPreference = useSettingsStore(
    (state) => state.setAdaptiveNudgesEnabled,
  );
  const refreshAllSurfaces = useTasksUiStore(
    (state) => state.refreshAllSurfaces,
  );
  const refreshRecovery = useTasksUiStore((state) => state.refreshRecovery);
  const refreshAttention = useTasksUiStore((state) => state.refreshAttention);
  const [phase, setPhase] = useState<LocalBootstrapPhase>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nativeCaptureRevision, setNativeCaptureRevision] = useState(0);
  const [notificationSync, setNotificationSync] =
    useState<NotificationSyncState>({ phase: "idle" });
  const [alertDialog, setAlertDialog] = useState<AetherAlertDialogState | null>(
    null,
  );
  const notificationSyncRef = useRef<Promise<void> | null>(null);

  const syncNotifications = useCallback(
    (
      options: NotificationReconciliationOptions = {
        mode: "full",
        reason: "cold-start",
      },
    ) => {
      if (notificationSyncRef.current) return notificationSyncRef.current;

      const operation = (async () => {
        setNotificationSync((current) => ({
          phase: "syncing",
          message: current.message,
        }));
        try {
          const core = getAetherCore(getDatabase());
          try {
            await core.services.nudges.replanBoundedHorizon(new Date());
          } catch (error) {
            reportNonFatalError("adaptive-nudge-replan", error);
          }
          try {
            setAdaptiveNudgesPreference(await core.services.nudges.isEnabled());
          } catch (error) {
            reportNonFatalError("adaptive-nudge-setting-sync", error);
          }
          await syncLocalNotifications(
            {
              configure: configureLocalNotifications,
              reconcile: (reconcileOptions) =>
                core.reconcileNotifications(reconcileOptions),
            },
            options,
          );
          await core.services.repos.appMeta.set(
            "reliability.device_timezone",
            getDeviceTimeZone() ?? "unknown",
          );
          setNotificationSync({ phase: "ready" });
        } catch (error) {
          reportNonFatalError("notifications-sync", error);
          try {
            await getAetherCore(getDatabase()).services.repos.appMeta.set(
              "reliability.last_error_category",
              error instanceof NotificationError
                ? error.code
                : "RECONCILIATION_FAILED",
            );
          } catch (persistenceError) {
            reportNonFatalError("notifications-sync-state", persistenceError);
          }
          setNotificationSync({
            phase: "error",
            message: getNotificationErrorMessage(error),
          });
        } finally {
          notificationSyncRef.current = null;
        }
      })();

      notificationSyncRef.current = operation;
      return operation;
    },
    [setAdaptiveNudgesPreference],
  );

  const syncForegroundNotifications = useCallback(async () => {
    try {
      const core = getAetherCore(getDatabase());
      const timezone = getDeviceTimeZone() ?? "unknown";
      const previousTimezone = await core.services.repos.appMeta.get(
        "reliability.device_timezone",
      );
      const lastErrorCategory = await core.services.repos.appMeta.get(
        "reliability.last_error_category",
      );
      const fullRepair =
        previousTimezone === null ||
        previousTimezone !== timezone ||
        (lastErrorCategory !== null && lastErrorCategory !== "NONE");
      await syncNotifications({
        mode: fullRepair ? "full" : "incremental",
        reason: fullRepair
          ? previousTimezone !== timezone
            ? "timezone-change"
            : "foreground-repair"
          : "foreground-dirty",
      });
      await refreshRecovery();
    } catch (error) {
      reportNonFatalError("notifications-foreground-select", error);
    }
  }, [refreshRecovery, syncNotifications]);

  const syncForegroundCaptures = useCallback(async () => {
    try {
      if (getPendingNativeCaptureId()) router.push("/capture" as never);
      await drainCaptureInbox({
        invalidations: {
          async taskCommitted() {
            await Promise.all([refreshAllSurfaces(), refreshAttention()]);
          },
        },
      });
    } catch (error) {
      reportNonFatalError("capture-foreground-drain", error);
    }
  }, [refreshAllSurfaces, refreshAttention, router]);

  const runDatabaseRecovery = useCallback(
    async (mode: Exclude<DatabaseRecoveryMode, "check">) => {
      setPhase("loading");
      setErrorMessage(null);
      try {
        await recoverDatabase(
          mode,
          mode === "recreate" ? RECREATE_DATABASE_CONFIRMATION : undefined,
        );
        await bootstrapAppData();
        await loadSettings();
        if (mode === "recreate") {
          useTasksUiStore.setState({
            status: "idle",
            error: null,
            todayTasks: [],
            upcomingTasks: [],
            allTasks: [],
            todayLoadedDate: null,
            upcomingLoadedDate: null,
            allLoaded: false,
            recoveryLoadedRevision: null,
            undoReceipt: null,
            undoError: null,
            undoing: false,
            recoveryStatus: "idle",
            recoveryPlan: null,
            recoveryError: null,
            attentionPlan: null,
            attentionStatus: "idle",
            attentionError: null,
            attentionSuppressedTaskIds: [],
          });
        }
        setPhase("ready");
        await refreshAllSurfaces();
        await refreshRecovery();
        void syncNotifications({
          mode: "full",
          reason: `database-recovery-${mode}`,
        });
      } catch (error) {
        reportNonFatalError(`database-recovery-${mode}`, error);
        setErrorMessage(getDatabaseErrorMessage(error));
        setPhase("error");
      }
    },
    [loadSettings, refreshAllSurfaces, refreshRecovery, syncNotifications],
  );

  const confirmDatabaseRecreation = useCallback(() => {
    setAlertDialog({
      title: "Recreate local database?",
      message:
        "This permanently deletes all reminders and local history on this device.",
      actions: [
        { label: "Cancel", role: "cancel" },
        {
          label: "Delete and recreate",
          role: "destructive",
          onPress: () => {
            void runDatabaseRecovery("recreate");
          },
        },
      ],
    });
  }, [runDatabaseRecovery]);

  const checkDatabaseIntegrity = useCallback(async () => {
    setPhase("loading");
    setErrorMessage(null);
    try {
      await recoverDatabase("check");
      setErrorMessage(
        "Integrity check passed. Your data was not changed. You can retry safely.",
      );
      setPhase("error");
    } catch (error) {
      reportNonFatalError("database-integrity-check", error);
      setErrorMessage(getDatabaseErrorMessage(error));
      setPhase("error");
    }
  }, []);

  const dismissAlertDialog = useCallback(() => {
    setAlertDialog(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await bootstrapAppData();
        if (cancelled) return;
        await loadSettings();
        // Task projections are loaded by the focused route. Keeping boot limited
        // to database readiness avoids querying Today twice on cold start.
        setPhase("ready");
        setErrorMessage(null);
        await initializeCaptureInbox();
        await drainCaptureInbox({
          invalidations: {
            async taskCommitted() {
              await Promise.all([refreshAllSurfaces(), refreshAttention()]);
            },
          },
        });
        if (getPendingNativeCaptureId()) router.replace("/capture" as never);
        void syncNotifications();
      } catch (error) {
        if (cancelled) return;
        reportNonFatalError("database-bootstrap", error);
        setErrorMessage(getDatabaseErrorMessage(error));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    loadSettings,
    refreshAllSurfaces,
    refreshAttention,
    router,
    syncNotifications,
  ]);

  useEffect(
    () =>
      addNativeCaptureListener(() => {
        setNativeCaptureRevision((value) => value + 1);
      }),
    [],
  );

  useEffect(() => {
    if (phase === "ready" && getPendingNativeCaptureId()) {
      router.push("/capture" as never);
    }
  }, [nativeCaptureRevision, phase, router]);

  useEffect(() => {
    if (phase !== "ready") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void syncForegroundNotifications();
      void syncForegroundCaptures();
    });
    return () => subscription.remove();
  }, [phase, syncForegroundCaptures, syncForegroundNotifications]);

  useEffect(() => {
    if (phase !== "ready") return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    const core = getAetherCore(getDatabase());

    void registerNotificationActionListener(core, async () => {
      await refreshAllSurfaces();
      await refreshRecovery();
      await syncNotifications({
        mode: "incremental",
        reason: "notification-action",
      });
    })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unsubscribe = cleanup;
      })
      .catch((error: unknown) => {
        reportNonFatalError("notification-actions-register", error);
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [phase, refreshAllSurfaces, refreshRecovery, syncNotifications]);

  return {
    phase,
    errorMessage,
    syncNotifications,
    notificationSync,
    alertDialog,
    dismissAlertDialog,
    retryDatabase: () => runDatabaseRecovery("retry"),
    checkDatabaseIntegrity,
    confirmDatabaseRecreation,
  };
}

export function LocalAppBootstrap({ children }: PropsWithChildren) {
  const state = useLocalAppBootstrapState();

  return (
    <LocalAppBootstrapContext.Provider value={state}>
      {children}
      <LocalBootstrapOverlay state={state} />
    </LocalAppBootstrapContext.Provider>
  );
}

function LocalBootstrapOverlay({
  state,
}: {
  state: ReturnType<typeof useLocalAppBootstrapState>;
}) {
  const theme = useAetherTheme();
  const { colors } = theme;
  const bgColor = colors.background;

  return (
    <>
      {state.phase === "loading" && (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.boot,
            { backgroundColor: bgColor },
          ]}
        >
          <ActivityIndicator color={colors.interactive} />
          <Typography
            variant="caption"
            color={colors.textSecondary}
            style={styles.bootText}
          >
            Preparing local data…
          </Typography>
        </View>
      )}

      {state.phase === "error" && (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.boot,
            { backgroundColor: bgColor },
          ]}
        >
          <Typography variant="title" align="center">
            Database unavailable
          </Typography>
          <Typography
            variant="body"
            color={colors.textSecondary}
            align="center"
            style={styles.bootText}
          >
            {state.errorMessage}
          </Typography>
          <View style={styles.recoveryActions}>
            <Button
              label="Retry safely"
              onPress={() => void state.retryDatabase()}
              fullWidth
            />
            <Button
              label="Check database"
              onPress={() => void state.checkDatabaseIntegrity()}
              variant="secondary"
              fullWidth
            />
            <Button
              label="Recreate local database"
              onPress={state.confirmDatabaseRecreation}
              variant="destructive"
              fullWidth
            />
          </View>
        </View>
      )}

      {state.phase === "ready" && state.notificationSync.message ? (
        <NotificationSyncBanner
          message={state.notificationSync.message}
          retrying={state.notificationSync.phase === "syncing"}
          onRetry={() => {
            void state.syncNotifications();
          }}
        />
      ) : null}

      {state.alertDialog ? (
        <AetherAlertDialog
          {...state.alertDialog}
          visible
          onDismiss={state.dismissAlertDialog}
          testID={state.alertDialog.testID ?? "root-alert-dialog"}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  bootText: {
    marginTop: 4,
  },
  recoveryActions: {
    width: "100%",
    maxWidth: 360,
    gap: 12,
    marginTop: 12,
  },
});
