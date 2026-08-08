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
  const keyLoaded = useSettingsStore((state) => state.openAiKeyLoaded);
  const configured = useSettingsStore((state) => state.openAiConfigured);

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
            OpenAI realtime transcription turns your voice into an instruction for the existing AETHER agent.
          </Typography>
        </View>

        <Card variant="glass" style={styles.hero} padding={Spacing.lg}>
          <View style={styles.micOrb}>
            <Mic size={26} color={isDark ? Colors.white : Colors.black} />
          </View>
          <Typography variant="headline" style={styles.heroTitle}>Tap to talk</Typography>
          <Typography variant="body" color={Colors.zinc500}>
            Tap the AETHER orb to start hands-free voice input. Tap it again or use Stop &amp; Send to finish. Press and hold the orb to type instead.
          </Typography>
          <AnimatedPressable
            onPress={() => router.replace('/')}
            style={[styles.actionButton, { backgroundColor: isDark ? Colors.white : Colors.black }]}
          >
            <Typography variant="bodyBold" color={isDark ? Colors.black : Colors.white}>Use the AETHER orb</Typography>
          </AnimatedPressable>
        </Card>

        <Typography variant="caption" color={Colors.zinc500} style={styles.sectionLabel}>REALTIME FLOW</Typography>
        <Card variant="outline" style={styles.stepCard} padding={Spacing.md}>
          <View style={styles.stepRow}>
            <View style={styles.stepNumber}><Typography variant="tiny" color={isDark ? Colors.black : Colors.white}>1</Typography></View>
            <View style={styles.stepCopy}><Typography variant="bodyBold">Capture</Typography><Typography variant="caption" color={Colors.zinc500}>The native Expo audio stream sends mono PCM16 at 24 kHz.</Typography></View>
          </View>
          <View style={styles.connector} />
          <View style={styles.stepRow}>
            <View style={styles.stepNumber}><Typography variant="tiny" color={isDark ? Colors.black : Colors.white}>2</Typography></View>
            <View style={styles.stepCopy}><Typography variant="bodyBold">Transcribe</Typography><Typography variant="caption" color={Colors.zinc500}>OpenAI realtime events update the partial transcript and commit the final text.</Typography></View>
          </View>
          <View style={styles.connector} />
          <View style={styles.stepRow}>
            <View style={styles.stepNumber}><Typography variant="tiny" color={isDark ? Colors.black : Colors.white}>3</Typography></View>
            <View style={styles.stepCopy}><Typography variant="bodyBold">Reason</Typography><Typography variant="caption" color={Colors.zinc500}>Only the final transcript is submitted once to the OpenRouter AgentRuntime.</Typography></View>
          </View>
        </Card>

        <Card variant="elevated" style={styles.noteCard} padding={Spacing.md}>
          <ShieldCheck size={18} color="#2F855A" />
          <Typography variant="caption" color={Colors.zinc500} style={styles.noteCopy}>
            {configured ? 'OpenAI realtime transcription is configured. The OpenRouter key remains separate and is required for reasoning.' : keyLoaded ? 'Add an OpenAI key in Settings to enable realtime voice transcription.' : 'Checking OpenAI realtime transcription…'}
          </Typography>
        </Card>

        <View style={styles.tipRow}>
          <ArrowUp size={16} color={Colors.zinc500} />
          <Typography variant="caption" color={Colors.zinc500}>Voice starts hands-free; press and hold when you want the keyboard</Typography>
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
