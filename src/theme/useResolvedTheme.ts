import { useColorScheme } from 'react-native';
import { useSettingsStore } from '@/stores/settings.store';
import { resolveTheme, type ResolvedTheme } from './resolveTheme';

export type { ResolvedTheme };
export { resolveTheme };

export function useResolvedTheme(): ResolvedTheme {
  const preference = useSettingsStore((s) => s.theme);
  const systemScheme = useColorScheme();
  const normalized =
    systemScheme === 'light' || systemScheme === 'dark' ? systemScheme : null;
  return resolveTheme(preference, normalized);
}

export function useIsDark(): boolean {
  return useResolvedTheme() === 'dark';
}
