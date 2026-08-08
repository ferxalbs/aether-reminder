import { useMemo } from 'react';
import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brain, Check, KeyRound, Sparkles } from 'lucide-react-native';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { Card } from '@/components/ui/Card';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useSettingsStore } from '@/stores/settings.store';
import { useAssistantSurface } from '@/components/assistant/AssistantHost';

export default function AIScreen() {
  const router = useRouter();
  const isDark = useIsDark();
  const selectedModel = useSettingsStore((state) => state.selectedModel);
  const apiKeyLoaded = useSettingsStore((state) => state.apiKeyLoaded);
  const hasApiKey = useSettingsStore((state) => Boolean(state.openRouterApiKey));

  const assistantContext = useMemo(
    () => ({
      surface: 'ai',
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
          <Typography variant="caption" color={Colors.zinc500}>ASSISTANT</Typography>
          <Typography variant="display">AETHER</Typography>
          <Typography variant="body" color={Colors.zinc500} style={styles.subtitle}>
            A quiet command surface for planning, changing, and understanding your day.
          </Typography>
        </View>

        <Card variant="glass" style={styles.hero} padding={Spacing.lg}>
          <View style={styles.heroIcon}>
            <Sparkles size={24} color={isDark ? '#7FE0C2' : '#228B72'} />
          </View>
          <Typography variant="headline" style={styles.heroTitle}>
            {hasApiKey ? 'Ready for your next instruction.' : 'Connect an AI provider to begin.'}
          </Typography>
          <Typography variant="body" color={Colors.zinc500}>
            Tap the AETHER ball in the dock to open the composer. Hold it to speak instead of typing.
          </Typography>
        </Card>

        <Typography variant="caption" color={Colors.zinc500} style={styles.sectionLabel}>CONNECTION</Typography>
        <Card variant="elevated" style={styles.statusCard} padding={Spacing.md}>
          <View style={styles.row}>
            {hasApiKey ? <Check size={18} color="#2F855A" /> : <KeyRound size={18} color={Colors.zinc500} />}
            <View style={styles.rowCopy}>
              <Typography variant="bodyBold">{hasApiKey ? 'Provider connected' : apiKeyLoaded ? 'Provider not connected' : 'Checking provider…'}</Typography>
              <Typography variant="caption" color={Colors.zinc500}>
                {hasApiKey ? selectedModel || 'Choose a model in Settings' : 'Your key stays in SecureStore on this device.'}
              </Typography>
            </View>
          </View>
          {!hasApiKey ? (
            <AnimatedPressable
              onPress={() => router.replace('/settings')}
              style={[styles.actionButton, { backgroundColor: isDark ? Colors.white : Colors.black }]}
            >
              <Typography variant="bodyBold" color={isDark ? Colors.black : Colors.white}>Open Settings</Typography>
            </AnimatedPressable>
          ) : null}
        </Card>

        <Typography variant="caption" color={Colors.zinc500} style={styles.sectionLabel}>WHAT AETHER CAN DO</Typography>
        <View style={styles.capabilityGrid}>
          {[
            ['Plan', 'Turn an intention into dated tasks.'],
            ['Change', 'Complete, reopen, or update real tasks.'],
            ['Explain', 'Summarize the work already on your calendar.'],
          ].map(([title, copy]) => (
            <Card key={title} variant="outline" style={styles.capability} padding={Spacing.md}>
              <Brain size={18} color={isDark ? Colors.white : Colors.black} />
              <Typography variant="bodyBold" style={styles.capabilityTitle}>{title}</Typography>
              <Typography variant="caption" color={Colors.zinc500}>{copy}</Typography>
            </Card>
          ))}
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
  heroIcon: { width: 48, height: 48, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(127, 224, 194, 0.14)' },
  heroTitle: { marginTop: Spacing.xs },
  sectionLabel: { marginTop: Spacing.md },
  statusCard: { gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowCopy: { flex: 1, gap: 2 },
  actionButton: { alignSelf: 'flex-start', borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  capabilityGrid: { gap: Spacing.sm },
  capability: { gap: Spacing.xs },
  capabilityTitle: { marginTop: Spacing.xs },
});
