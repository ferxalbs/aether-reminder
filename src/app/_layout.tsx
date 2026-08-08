import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSettingsStore } from '@/stores/settings.store';
import { useIsDark } from '@/theme/useResolvedTheme';

export default function RootLayout() {
  const loadApiKey = useSettingsStore((s) => s.loadApiKey);
  const isDark = useIsDark();

  useEffect(() => {
    void loadApiKey();
  }, [loadApiKey]);

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
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
        <Stack.Screen name="ai" />
        <Stack.Screen name="transcribe" />
        <Stack.Screen name="settings" />
      </Stack>
    </SafeAreaProvider>
  );
}
