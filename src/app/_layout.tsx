import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { BlurTargetView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { bootstrapAppData } from '@/db/bootstrap';
import { getDatabase } from '@/db';
import { configureLocalNotifications } from '@/services/notifications/localNotificationProjection';
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
  const refreshToday = useTasksUiStore((s) => s.refreshToday);
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
        await refreshToday();
        if (cancelled) return;
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
  }, [refreshToday, syncNotifications]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || boot.phase !== 'ready') return;
      void syncNotifications();
    });
    return () => subscription.remove();
  }, [boot.phase, syncNotifications]);

  if (boot.phase === 'loading') {
    return (
      <SafeAreaProvider>
        <View style={[styles.boot, { backgroundColor: isDark ? Colors.black : Colors.zinc50 }]}>
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
        <View style={[styles.boot, { backgroundColor: isDark ? Colors.black : Colors.zinc50 }]}>
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
      <View style={[styles.root, { backgroundColor: isDark ? Colors.black : Colors.zinc50 }]}>
        {notificationSync.message ? (
          <NotificationSyncBanner
            message={notificationSync.message}
            retrying={notificationSync.phase === 'syncing'}
            onRetry={() => { void syncNotifications(); }}
          />
        ) : null}
        <AssistantSurfaceProvider>
          <BlurTargetView ref={blurTarget} style={styles.routeTarget}>
            <Stack
              screenOptions={{
                headerShown: false,
                animation: 'fade',
                contentStyle: {
                  backgroundColor: isDark ? '#000000' : '#FAFAFA',
                },
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="tasks" />
              <Stack.Screen name="ai" />
              <Stack.Screen name="transcribe" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="ui-review" />
            </Stack>
          </BlurTargetView>
          <AssistantHost blurTarget={blurTarget} />
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
