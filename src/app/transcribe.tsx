import { Redirect } from 'expo-router';

/**
 * Compatibility entry point for old deep links. Voice capture is a contextual
 * mode launched from Compose or the assistant sheet, not a standalone page.
 */
export default function LegacyTranscribeRoute() {
  return <Redirect href="/" />;
}
