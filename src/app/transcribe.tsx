import { useMemo } from 'react';
import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowUp, Mic, ShieldCheck } from 'lucide-react-native';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { Card } from '@/components/ui/Card';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useSettingsStore } from '@/stores/settings.store';
import { useAssistantSurface } from '@/components/assistant/AssistantHost';

export default function TranscribeScreen() {
  const router = useRouter();
  const isDark = useIsDark();
  const apiKeyLoaded = useSettingsStore((state) => state.apiKeyLoaded);
  const hasApiKey = useSettingsStore((state) => Boolean(state.openRouterApiKey));

  const assistantContext = useMemo(
    () => ({
      surface: 'transcribe',
      locale: Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      invocationSource: 'app' as const,
    }),
    []
  );
  useAssistantSurface(assistantContext);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: isDark ? Colors.black : Colors.zinc50 }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Typography variant="caption" color={Colors.zinc500}>VOICE INPUT</Typography>
          <Typography variant="display">Transcribe</Typography>
          <Typography variant="body" color={Colors.zinc500} style={styles.subtitle}>
            Speak naturally. AETHER turns the recording into an instruction without keeping the audio file.
          </Typography>
        </View>

        <Card variant="glass" style={styles.hero} padding={Spacing.lg}>
          <View style={styles.micOrb}>
            <Mic size={26} color={isDark ? Colors.white : Colors.black} />
          </View>
          <Typography variant="headline" style={styles.heroTitle}>Hold to talk</Typography>
          <Typography variant="body" color={Colors.zinc500}>
            Press and hold the AETHER ball in the bottom dock. Release to send, or swipe up while holding to keep recording until you stop it.
          </Typography>
          <AnimatedPressable
            onPress={() => router.replace('/ai' as never)}
            style={[styles.actionButton, { backgroundColor: isDark ? Colors.white : Colors.black }]}
          >
            <Typography variant="bodyBold" color={isDark ? Colors.black : Colors.white}>Go to AETHER</Typography>
          </AnimatedPressable>
        </Card>

        <Typography variant="caption" color={Colors.zinc500} style={styles.sectionLabel}>FLOW</Typography>
        <Card variant="outline" style={styles.stepCard} padding={Spacing.md}>
          <View style={styles.stepRow}>
            <View style={styles.stepNumber}><Typography variant="tiny" color={isDark ? Colors.black : Colors.white}>1</Typography></View>
            <View style={styles.stepCopy}><Typography variant="bodyBold">Hold</Typography><Typography variant="caption" color={Colors.zinc500}>The ball responds immediately when recording begins.</Typography></View>
          </View>
          <View style={styles.connector} />
          <View style={styles.stepRow}>
            <View style={styles.stepNumber}><Typography variant="tiny" color={isDark ? Colors.black : Colors.white}>2</Typography></View>
            <View style={styles.stepCopy}><Typography variant="bodyBold">Release or lock</Typography><Typography variant="caption" color={Colors.zinc500}>Release for a quick send, or swipe up to lock the recording.</Typography></View>
          </View>
          <View style={styles.connector} />
          <View style={styles.stepRow}>
            <View style={styles.stepNumber}><Typography variant="tiny" color={isDark ? Colors.black : Colors.white}>3</Typography></View>
            <View style={styles.stepCopy}><Typography variant="bodyBold">Review the result</Typography><Typography variant="caption" color={Colors.zinc500}>The transcript goes straight into the assistant conversation.</Typography></View>
          </View>
        </Card>

        <Card variant="elevated" style={styles.noteCard} padding={Spacing.md}>
          <ShieldCheck size={18} color="#2F855A" />
          <Typography variant="caption" color={Colors.zinc500} style={styles.noteCopy}>
            {apiKeyLoaded && hasApiKey ? 'Voice transcription is ready. Audio is discarded after transcription.' : 'Add an OpenRouter key in Settings to enable transcription.'}
          </Typography>
        </Card>

        <View style={styles.tipRow}>
          <ArrowUp size={16} color={Colors.zinc500} />
          <Typography variant="caption" color={Colors.zinc500}>Swipe up while holding to lock recording</Typography>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 124, gap: Spacing.md },
  header: { marginBottom: Spacing.sm },
  subtitle: { marginTop: Spacing.xs },
  hero: { gap: Spacing.sm },
  micOrb: { width: 52, height: 52, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(127, 224, 194, 0.14)' },
  heroTitle: { marginTop: Spacing.xs },
  actionButton: { alignSelf: 'flex-start', borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginTop: Spacing.xs },
  sectionLabel: { marginTop: Spacing.md },
  stepCard: { gap: Spacing.sm },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  stepNumber: { width: 24, height: 24, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7FE0C2' },
  stepCopy: { flex: 1, gap: 2 },
  connector: { width: 1, height: 12, marginLeft: 12, backgroundColor: Colors.zinc700 },
  noteCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  noteCopy: { flex: 1 },
  tipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm },
});
