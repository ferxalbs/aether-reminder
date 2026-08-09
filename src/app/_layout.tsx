import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { BlurTargetView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { bootstrapAppData } from '@/db/bootstrap';
import { getDatabase } from '@/db';
import { configureLocalNotifications } from '@/services/notifications/localNotificationProjection';
import { registerNotificationActionListener } from '@/services/notifications/notificationActions';
import { getNotificationErrorMessage } from '@/services/notifications/errors';
import { syncLocalNotifications } from '@/services/notifications/notificationBootstrap';
import { getAetherCore } from '@/core';
import { getDatabaseErrorMessage } from '@/db/errors';
import { useSettingsStore } from '@/stores/settings.store';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Colors } from '@/theme/tokens';
import { Typography } from '@/components/ui/Typography';
import { NotificationSyncBanner } from '@/components/ui/NotificationSyncBanner';
import { GlassSurfaceProvider } from '@/components/ui/GlassSurface';
import { AssistantHost, AssistantSurfaceProvider } from '@/components/assistant/AssistantHost';
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

  const syncNotifications = useCallback(() => {
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
          reconcile: () => core.reconcileNotifications(),
        });
        setNotificationSync({ phase: 'ready' });
      } catch (error) {
        reportNonFatalError('notifications-sync', error);
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
      void syncNotifications();
    });
    return () => subscription.remove();
  }, [boot.phase, syncNotifications]);

  useEffect(() => {
    if (boot.phase !== 'ready') return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    const core = getAetherCore(getDatabase());

    void registerNotificationActionListener(core, async () => {
      await refreshAllSurfaces();
      await syncNotifications();
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

  if (boot.phase === 'loading') {
    return (
      <SafeAreaProvider>
        <View style={[styles.boot, { backgroundColor: isDark ? Colors.backgroundDark : Colors.backgroundLight }]}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <ActivityIndicator color={isDark ? Colors.white : Colors.black} />
          <Typography variant="caption" color={Colors.zinc500} style={styles.bootText}>
            Preparing local data…
          </Typography>
        </View>
      </SafeAreaProvider>
    );
  }

  if (boot.phase === 'error') {
    return (
      <SafeAreaProvider>
        <View style={[styles.boot, { backgroundColor: isDark ? Colors.backgroundDark : Colors.backgroundLight }]}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <Typography variant="title" align="center">
            Database unavailable
          </Typography>
          <Typography variant="body" color={Colors.zinc500} align="center" style={styles.bootText}>
            {boot.message}
          </Typography>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.root, { backgroundColor: isDark ? Colors.backgroundDark : Colors.backgroundLight }]}>
        {notificationSync.message ? (
          <NotificationSyncBanner
            message={notificationSync.message}
            retrying={notificationSync.phase === 'syncing'}
            onRetry={() => { void syncNotifications(); }}
          />
        ) : null}
        <AssistantSurfaceProvider>
          <GlassSurfaceProvider blurTarget={blurTarget}>
            <BlurTargetView ref={blurTarget} style={styles.routeTarget}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: 'fade_from_bottom',
                  contentStyle: {
                    backgroundColor: isDark ? Colors.backgroundDark : Colors.backgroundLight,
                  },
                }}
              >
                <Stack.Screen name="index" options={{ title: 'Compose' }} />
                <Stack.Screen name="tasks" options={{ title: 'Upcoming' }} />
                <Stack.Screen name="all" options={{ title: 'All' }} />
                <Stack.Screen name="settings" options={{ title: 'Settings' }} />
              </Stack>
            </BlurTargetView>
            <AssistantHost blurTarget={blurTarget} />
          </GlassSurfaceProvider>
        </AssistantSurfaceProvider>
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
  routeTarget: {
    flex: 1,
  },
});
