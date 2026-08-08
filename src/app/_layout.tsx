import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { BlurTargetView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { bootstrapAppData } from '@/db/bootstrap';
import { getDatabaseErrorMessage } from '@/db/errors';
import { useSettingsStore } from '@/stores/settings.store';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Colors } from '@/theme/tokens';
import { Typography } from '@/components/ui/Typography';
import { AssistantHost, AssistantSurfaceProvider } from '@/components/assistant/AssistantHost';

type BootState =
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'error'; message: string };

export default function RootLayout() {
  const loadCredentials = useSettingsStore((s) => s.loadCredentials);
  const refreshToday = useTasksUiStore((s) => s.refreshToday);
  const isDark = useIsDark();
  const blurTarget = useRef<View | null>(null);
  const [boot, setBoot] = useState<BootState>({ phase: 'loading' });

  useEffect(() => {
    void loadCredentials();
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
      } catch (error) {
        if (cancelled) return;
        setBoot({ phase: 'error', message: getDatabaseErrorMessage(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshToday]);

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
          </Stack>
        </BlurTargetView>
        <AssistantHost blurTarget={blurTarget} />
      </AssistantSurfaceProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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
