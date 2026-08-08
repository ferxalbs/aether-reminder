import { useMemo } from 'react';
import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brain, Check, KeyRound, Sparkles } from 'lucide-react-native';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useSettingsStore } from '@/stores/settings.store';
import { DEFAULT_OPENROUTER_MODEL_ID } from '@/services/ai/models';
import { useAssistantSurface } from '@/components/assistant/AssistantHost';

export default function AIScreen() {
  const router = useRouter();
  const isDark = useIsDark();
  const selectedModel = useSettingsStore((state) => state.selectedModel);
  const keyLoaded = useSettingsStore((state) => state.openRouterKeyLoaded);
  const configured = useSettingsStore((state) => state.openRouterConfigured);

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
            The OpenRouter reasoning surface for planning, changing, and understanding your day.
          </Typography>
        </View>

        <Card variant="glass" style={styles.hero} padding={Spacing.lg}>
          <View style={styles.heroIcon}>
            <Sparkles size={24} color={isDark ? '#7FE0C2' : '#228B72'} />
          </View>
          <Typography variant="headline" style={styles.heroTitle}>
            {configured ? 'Ready for your next instruction.' : 'Connect OpenRouter to begin.'}
          </Typography>
          <Typography variant="body" color={Colors.zinc500}>
            The global AETHER orb and composer are the only assistant interaction surface. Tap the orb in the dock to open them.
          </Typography>
        </Card>

        <Typography variant="caption" color={Colors.zinc500} style={styles.sectionLabel}>OPENROUTER CONNECTION</Typography>
        <Card variant="elevated" style={styles.statusCard} padding={Spacing.md}>
          <View style={styles.row}>
            {configured ? <Check size={18} color="#2F855A" /> : <KeyRound size={18} color={Colors.zinc500} />}
            <View style={styles.rowCopy}>
              <Typography variant="bodyBold">
                {configured ? 'OpenRouter connected' : keyLoaded ? 'OpenRouter not connected' : 'Checking OpenRouter…'}
              </Typography>
              <Typography variant="caption" color={Colors.zinc500}>
                {configured ? `Selected model: ${selectedModel || DEFAULT_OPENROUTER_MODEL_ID}` : 'The OpenRouter key is used only for AI reasoning and task tools.'}
              </Typography>
            </View>
          </View>
          {!configured ? (
            <Button
              label="Open Settings"
              onPress={() => router.replace('/settings')}
              style={styles.actionButton}
            />
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
  actionButton: { alignSelf: 'flex-start' },
  capabilityGrid: { gap: Spacing.sm },
  capability: { gap: Spacing.xs },
  capabilityTitle: { marginTop: Spacing.xs },
});
