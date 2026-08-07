import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSettingsStore } from '@/stores/settings.store';

export default function RootLayout() {
  const loadApiKey = useSettingsStore((s) => s.loadApiKey);
  const theme = useSettingsStore((s) => s.theme);
  const isDark = theme === 'dark' || (theme === 'system' && true);

  useEffect(() => {
    void loadApiKey();
  }, [loadApiKey]);

  return (
    <>
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
    </>
  );
}
