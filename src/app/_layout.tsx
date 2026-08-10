import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
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
          <GlassSurfaceProvider blurTarget={blurTarget}>
            <View ref={blurTarget} style={styles.routeTarget}>
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
            </View>
            {boot.phase === 'ready' && (
              <>
                <AppBottomNavigation />
                <AssistantHost blurTarget={blurTarget} />
              </>
            )}
          </GlassSurfaceProvider>
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
  routeTarget: {
    flex: 1,
  },
});
