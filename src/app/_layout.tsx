import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurTargetView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { bootstrapAppData } from '@/db/bootstrap';
import {
  getDatabase,
  recoverDatabase,
  RECREATE_DATABASE_CONFIRMATION,
  type DatabaseRecoveryMode,
} from '@/db';
import { configureLocalNotifications } from '@/services/notifications/localNotificationProjection';
import { registerNotificationActionListener } from '@/services/notifications/notificationActions';
import {
  getNotificationErrorMessage,
  NotificationError,
} from '@/services/notifications/errors';
import { syncLocalNotifications } from '@/services/notifications/notificationBootstrap';
import type { NotificationReconciliationOptions } from '@/services/notifications/notificationReconciliation';
import { getDeviceTimeZone } from '@/temporal/localCalendar';
import { getAetherCore } from '@/core';
import { getDatabaseErrorMessage } from '@/db/errors';
import { useSettingsStore } from '@/stores/settings.store';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Colors } from '@/theme/tokens';
import { Typography } from '@/components/ui/Typography';
import { Button } from '@/components/ui/Button';
import { NotificationSyncBanner } from '@/components/ui/NotificationSyncBanner';
import { AssistantHost, AssistantSurfaceProvider } from '@/components/assistant/AssistantHost';
import { AppBottomNavigation } from '@/components/assistant/AppBottomNavigation';
import { reportNonFatalError } from '@/lib/nonFatalError';

type BootState =
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'error'; message: string };

type NotificationSyncState = {
  phase: 'idle' | 'syncing' | 'ready' | 'error';
  message?: string;
};

export default function RootLayout() {
  const loadCredentials = useSettingsStore((s) => s.loadCredentials);
  const refreshAllSurfaces = useTasksUiStore((s) => s.refreshAllSurfaces);
  const isDark = useIsDark();
  const blurTarget = useRef<View | null>(null);
  const [boot, setBoot] = useState<BootState>({ phase: 'loading' });
  const [notificationSync, setNotificationSync] = useState<NotificationSyncState>({ phase: 'idle' });
  const notificationSyncRef = useRef<Promise<void> | null>(null);

  const syncNotifications = useCallback((
    options: NotificationReconciliationOptions = { mode: 'full', reason: 'cold-start' },
  ) => {
    if (notificationSyncRef.current) return notificationSyncRef.current;

    const operation = (async () => {
      setNotificationSync((current) => ({
        phase: 'syncing',
        message: current.message,
      }));
      try {
        const core = getAetherCore(getDatabase());
        await syncLocalNotifications({
          configure: configureLocalNotifications,
          reconcile: (reconcileOptions) => core.reconcileNotifications(reconcileOptions),
        }, options);
        await core.services.repos.appMeta.set(
          'reliability.device_timezone',
          getDeviceTimeZone() ?? 'unknown',
        );
        setNotificationSync({ phase: 'ready' });
      } catch (error) {
        reportNonFatalError('notifications-sync', error);
        try {
          await getAetherCore(getDatabase()).services.repos.appMeta.set(
            'reliability.last_error_category',
            error instanceof NotificationError ? error.code : 'RECONCILIATION_FAILED',
          );
        } catch (persistenceError) {
          reportNonFatalError('notifications-sync-state', persistenceError);
        }
        setNotificationSync({
          phase: 'error',
          message: getNotificationErrorMessage(error),
        });
      } finally {
        notificationSyncRef.current = null;
      }
    })();

    notificationSyncRef.current = operation;
    return operation;
  }, []);

  const syncForegroundNotifications = useCallback(async () => {
    try {
      const core = getAetherCore(getDatabase());
      const timezone = getDeviceTimeZone() ?? 'unknown';
      const previousTimezone = await core.services.repos.appMeta.get('reliability.device_timezone');
      const lastErrorCategory = await core.services.repos.appMeta.get('reliability.last_error_category');
      const fullRepair = previousTimezone === null
        || previousTimezone !== timezone
        || (lastErrorCategory !== null && lastErrorCategory !== 'NONE');
      await syncNotifications({
        mode: fullRepair ? 'full' : 'incremental',
        reason: fullRepair
          ? previousTimezone !== timezone ? 'timezone-change' : 'foreground-repair'
          : 'foreground-dirty',
      });
    } catch (error) {
      reportNonFatalError('notifications-foreground-select', error);
    }
  }, [syncNotifications]);

  const runDatabaseRecovery = useCallback(async (mode: Exclude<DatabaseRecoveryMode, 'check'>) => {
    setBoot({ phase: 'loading' });
    try {
      await recoverDatabase(
        mode,
        mode === 'recreate' ? RECREATE_DATABASE_CONFIRMATION : undefined,
      );
      await bootstrapAppData();
      if (mode === 'recreate') {
        useTasksUiStore.setState({
          status: 'idle',
          error: null,
          todayTasks: [],
          upcomingTasks: [],
          allTasks: [],
          undoReceipt: null,
          undoError: null,
          undoing: false,
        });
      }
      setBoot({ phase: 'ready' });
      await refreshAllSurfaces();
      void syncNotifications({ mode: 'full', reason: `database-recovery-${mode}` });
    } catch (error) {
      reportNonFatalError(`database-recovery-${mode}`, error);
      setBoot({ phase: 'error', message: getDatabaseErrorMessage(error) });
    }
  }, [refreshAllSurfaces, syncNotifications]);

  const confirmDatabaseRecreation = useCallback(() => {
    Alert.alert(
      'Recreate local database?',
      'This permanently deletes all reminders and local history on this device. Saved provider credentials are not deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete and recreate',
          style: 'destructive',
          onPress: () => { void runDatabaseRecovery('recreate'); },
        },
      ],
    );
  }, [runDatabaseRecovery]);

  const checkDatabaseIntegrity = useCallback(async () => {
    setBoot({ phase: 'loading' });
    try {
      await recoverDatabase('check');
      setBoot({
        phase: 'error',
        message: 'Integrity check passed. Your data was not changed. You can retry safely.',
      });
    } catch (error) {
      reportNonFatalError('database-integrity-check', error);
      setBoot({ phase: 'error', message: getDatabaseErrorMessage(error) });
    }
  }, []);

  useEffect(() => {
    void loadCredentials().catch((error: unknown) => {
      reportNonFatalError('credentials-load', error);
    });
  }, [loadCredentials]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await bootstrapAppData();
        if (cancelled) return;
        // Task projections are loaded by the focused route. Keeping boot limited
        // to database readiness avoids querying Today twice on cold start.
        setBoot({ phase: 'ready' });
        void syncNotifications();
      } catch (error) {
        if (cancelled) return;
        reportNonFatalError('database-bootstrap', error);
        setBoot({ phase: 'error', message: getDatabaseErrorMessage(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncNotifications]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || boot.phase !== 'ready') return;
      void syncForegroundNotifications();
    });
    return () => subscription.remove();
  }, [boot.phase, syncForegroundNotifications]);

  useEffect(() => {
    if (boot.phase !== 'ready') return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    const core = getAetherCore(getDatabase());

    void registerNotificationActionListener(core, async () => {
      await refreshAllSurfaces();
      await syncNotifications({ mode: 'incremental', reason: 'notification-action' });
    })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unsubscribe = cleanup;
      })
      .catch((error: unknown) => {
        reportNonFatalError('notification-actions-register', error);
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [boot.phase, refreshAllSurfaces, syncNotifications]);

  const bgColor = isDark ? Colors.backgroundDark : Colors.backgroundLight;

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.root, { backgroundColor: bgColor }]}>
        {/* Always mount the Tabs navigator so Expo Router's useLinking can apply
            the initial URL state without the "state update before mount" warning.
            AssistantHost and AppBottomNavigation are gated on boot.phase === 'ready'
            because they call getDatabase() synchronously at render time. */}
        <AssistantSurfaceProvider>
          <>
            <BlurTargetView ref={blurTarget} style={styles.routeTarget}>
              <Tabs
                tabBar={() => null}
                screenOptions={{
                  headerShown: false,
                  tabBarHideOnKeyboard: true,
                  sceneStyle: { backgroundColor: bgColor },
                }}
                screenListeners={{
                  state: (event) => {
                    if (__DEV__) console.info('[AETHER tabs] state changed', event.data.state);
                  },
                }}
              >
                <Tabs.Screen name="index" options={{ title: 'Today' }} />
                <Tabs.Screen name="tasks" options={{ title: 'Schedule' }} />
                <Tabs.Screen name="all" options={{ title: 'Reminders' }} />
                <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
                <Tabs.Screen name="ai" options={{ href: null }} />
                <Tabs.Screen name="transcribe" options={{ href: null }} />
              </Tabs>
            </BlurTargetView>
            {boot.phase === 'ready' && (
              <>
                <AppBottomNavigation blurTarget={blurTarget} />
                <AssistantHost blurTarget={blurTarget} />
              </>
            )}
          </>
        </AssistantSurfaceProvider>

        {/* Loading overlay — rendered on top while the DB bootstraps */}
        {boot.phase === 'loading' && (
          <View style={[StyleSheet.absoluteFill, styles.boot, { backgroundColor: bgColor }]}>
            <ActivityIndicator color={isDark ? Colors.white : Colors.black} />
            <Typography variant="caption" color={Colors.zinc500} style={styles.bootText}>
              Preparing local data…
            </Typography>
          </View>
        )}

        {/* Error overlay — rendered on top if DB bootstrap fails */}
        {boot.phase === 'error' && (
          <View style={[StyleSheet.absoluteFill, styles.boot, { backgroundColor: bgColor }]}>
            <Typography variant="title" align="center">
              Database unavailable
            </Typography>
            <Typography variant="body" color={Colors.zinc500} align="center" style={styles.bootText}>
              {boot.message}
            </Typography>
            <View style={styles.recoveryActions}>
              <Button
                label="Retry safely"
                onPress={() => { void runDatabaseRecovery('retry'); }}
                fullWidth
              />
              <Button
                label="Check database"
                onPress={() => { void checkDatabaseIntegrity(); }}
                variant="secondary"
                fullWidth
              />
              <Button
                label="Recreate local database"
                onPress={confirmDatabaseRecreation}
                variant="destructive"
                fullWidth
              />
            </View>
          </View>
        )}

        {boot.phase === 'ready' && notificationSync.message ? (
          <NotificationSyncBanner
            message={notificationSync.message}
            retrying={notificationSync.phase === 'syncing'}
            onRetry={() => { void syncNotifications(); }}
          />
        ) : null}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  bootText: {
    marginTop: 4,
  },
  recoveryActions: {
    width: '100%',
    maxWidth: 360,
    gap: 12,
    marginTop: 12,
  },
  routeTarget: {
    flex: 1,
  },
});
