import { Redirect } from 'expo-router';

/**
 * Compatibility entry point for old deep links. The assistant is now a
 * contextual surface opened from Compose, while provider/model controls live
 * in Settings.
 */
export default function LegacyAiRoute() {
  return <Redirect href="/settings" />;
}
