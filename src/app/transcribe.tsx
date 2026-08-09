import { useMemo } from 'react';
import { ScrollView, StatusBar, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowUp, Mic, ShieldCheck, Sparkles } from 'lucide-react-native';
import { Colors, LayoutTokens, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AetherMark } from '@/components/ui/AetherMark';
import { useSettingsStore } from '@/stores/settings.store';
import { useAssistantSurface } from '@/components/assistant/AssistantHost';

export default function TranscribeScreen() {
  const router = useRouter();
  const isDark = useIsDark();
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const horizontalPadding =
    width >= 980 ? LayoutTokens.screenHorizontalWide : LayoutTokens.screenHorizontal;
  const keyLoaded = useSettingsStore((state) => state.openAiKeyLoaded);
  const configured = useSettingsStore((state) => state.openAiConfigured);

  const assistantContext = useMemo(
    () => ({
      surface: 'transcribe',
      locale: Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      invocationSource: 'app' as const,
    }),
    [],
  );
  useAssistantSurface(assistantContext);

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: isDark ? Colors.backgroundDark : Colors.backgroundLight },
      ]}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: horizontalPadding,
            maxWidth: LayoutTokens.contentMaxWidth,
          },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View style={styles.brandLockup}>
            <AetherMark size={32} muted={isDark} />
            <View>
              <Typography variant="bodyBold">AETHER</Typography>
              <Typography
                variant="tiny"
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
              >
                Voice
              </Typography>
            </View>
          </View>
          <View style={styles.livePill}>
            <View
              style={[
                styles.liveDot,
                { backgroundColor: configured ? Colors.successLight : Colors.warningLight },
              ]}
            />
            <Typography
              variant="tiny"
              color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
            >
              {configured ? 'READY' : 'SETUP'}
            </Typography>
          </View>
        </View>

        <View style={styles.header}>
          <Typography
            variant="caption"
            color={isDark ? Colors.brandCyan : Colors.brandBlue}
            style={styles.eyebrow}
          >
            VOICE-FIRST AI
          </Typography>
          <Typography variant="display">Speak naturally.</Typography>
          <Typography variant="display" style={styles.displaySecondLine}>
            Let AETHER organize it.
          </Typography>
          <Typography
            variant="body"
            color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
            style={styles.subtitle}
          >
            A realtime transcript becomes one clear instruction for the AETHER agent.
          </Typography>
        </View>

        <View style={[styles.bodyGrid, isWide && styles.bodyGridWide]}>
          <Card
            variant="elevated"
            padding={Spacing.xl}
            style={[styles.hero, isWide && styles.heroWide]}
          >
            <View style={styles.heroTop}>
              <View
                style={[
                  styles.micOrb,
                  {
                    backgroundColor: isDark
                      ? 'rgba(101, 214, 192, 0.14)'
                      : 'rgba(47, 124, 255, 0.10)',
                  },
                ]}
              >
                <Mic
                  size={28}
                  color={isDark ? Colors.brandCyan : Colors.brandBlue}
                  strokeWidth={2}
                />
              </View>
              <AetherMark size={52} muted={isDark} />
            </View>
            <View style={styles.heroCopy}>
              <Typography variant="headline">Tap to talk</Typography>
              <Typography
                variant="body"
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
              >
                Tap the AETHER orb to start hands-free voice input. Press and hold it whenever
                typing is faster.
              </Typography>
            </View>
            <View style={styles.waveRow} accessibilityLabel="Voice input waveform">
              {[8, 18, 30, 14, 24, 38, 20, 12, 26, 16, 8].map((height, index) => (
                <View
                  key={String(index)}
                  style={[
                    styles.waveBar,
                    {
                      height,
                      backgroundColor: isDark ? Colors.brandCyan : Colors.brandBlue,
                      opacity: 0.35 + index / 24,
                    },
                  ]}
                />
              ))}
            </View>
            <Button
              label="Use the AETHER orb"
              onPress={() => router.replace('/')}
              fullWidth={!isWide}
              icon={
                <ArrowUp
                  size={17}
                  color={isDark ? Colors.brandInk : Colors.white}
                  strokeWidth={2.5}
                />
              }
              style={styles.actionButton}
            />
          </Card>

          <View style={[styles.sideColumn, isWide && styles.sideColumnWide]}>
            <Typography
              variant="caption"
              color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
              style={styles.sectionLabel}
            >
              REALTIME FLOW
            </Typography>
            <Card variant="glass" padding={Spacing.lg} style={styles.stepCard}>
              <FlowStep
                number="01"
                title="Capture"
                copy="A native Expo audio stream keeps your voice clear and responsive."
              />
              <View
                style={[
                  styles.connector,
                  { backgroundColor: isDark ? Colors.borderDark : Colors.borderLight },
                ]}
              />
              <FlowStep
                number="02"
                title="Transcribe"
                copy="Realtime events update the partial transcript, then commit the final text."
              />
              <View
                style={[
                  styles.connector,
                  { backgroundColor: isDark ? Colors.borderDark : Colors.borderLight },
                ]}
              />
              <FlowStep
                number="03"
                title="Reason"
                copy="Only the final transcript is sent once to the existing AETHER agent."
              />
            </Card>

            <Card variant="elevated" padding={Spacing.md} style={styles.noteCard}>
              <View style={styles.noteIcon}>
                <ShieldCheck
                  size={18}
                  color={isDark ? Colors.successDark : Colors.successLight}
                  strokeWidth={2.1}
                />
              </View>
              <Typography
                variant="caption"
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                style={styles.noteCopy}
              >
                {configured
                  ? 'OpenAI realtime transcription is configured. OpenRouter remains separate for reasoning.'
                  : keyLoaded
                    ? 'Add an OpenAI key in Settings to enable realtime voice transcription.'
                    : 'Checking OpenAI realtime transcription…'}
              </Typography>
            </Card>
          </View>
        </View>

        <View style={styles.tipRow}>
          <Sparkles size={16} color={isDark ? Colors.brandGold : Colors.warningLight} />
          <Typography
            variant="caption"
            color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
          >
            Voice is for capture. AETHER handles the organizing.
          </Typography>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FlowStep({ number, title, copy }: { number: string; title: string; copy: string }) {
  const isDark = useIsDark();

  return (
    <View style={styles.stepRow}>
      <View
        style={[
          styles.stepNumber,
          { backgroundColor: isDark ? Colors.surfaceRaisedLight : Colors.brandInk },
        ]}
      >
        <Typography variant="tiny" color={isDark ? Colors.brandInk : Colors.white}>
          {number}
        </Typography>
      </View>
      <View style={styles.stepCopy}>
        <Typography variant="bodyBold">{title}</Typography>
        <Typography
          variant="caption"
          color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
        >
          {copy}
        </Typography>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    width: '100%',
    alignSelf: 'center',
    paddingTop: Spacing.md,
    paddingBottom: 144,
    gap: Spacing.md,
  },
  topBar: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  livePill: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(47, 124, 255, 0.08)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.pill,
  },
  header: {
    maxWidth: LayoutTokens.readingMaxWidth,
    marginBottom: Spacing.lg,
  },
  eyebrow: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.55,
    marginBottom: Spacing.xs,
  },
  displaySecondLine: {
    marginTop: -3,
  },
  subtitle: {
    maxWidth: 600,
    marginTop: Spacing.sm,
  },
  bodyGrid: {
    gap: Spacing.md,
  },
  bodyGridWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  hero: {
    gap: Spacing.lg,
  },
  heroWide: {
    flex: 1.12,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  micOrb: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  heroCopy: {
    gap: Spacing.xs,
  },
  waveRow: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
  },
  waveBar: {
    width: 4,
    borderRadius: Radius.pill,
  },
  actionButton: {
    alignSelf: 'flex-start',
  },
  sideColumn: {
    gap: Spacing.sm,
  },
  sideColumnWide: {
    flex: 1,
  },
  sectionLabel: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
    letterSpacing: 1.35,
    fontWeight: '700',
  },
  stepCard: {
    gap: Spacing.sm,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  stepNumber: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  stepCopy: {
    flex: 1,
    gap: 3,
  },
  connector: {
    width: 1,
    height: 13,
    marginLeft: 16,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  noteIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: 'rgba(24, 134, 75, 0.10)',
  },
  noteCopy: {
    flex: 1,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
});
