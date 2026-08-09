import React, { useMemo } from 'react';
import { ScrollView, StatusBar, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brain, Check, KeyRound, Sparkles, Wrench } from 'lucide-react-native';
import { Colors, LayoutTokens, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AetherMark } from '@/components/ui/AetherMark';
import { useSettingsStore } from '@/stores/settings.store';
import { DEFAULT_OPENROUTER_MODEL_ID } from '@/services/ai/models';
import { useAssistantActions, useAssistantSurface } from '@/components/assistant/AssistantHost';

export default function AIScreen() {
  const router = useRouter();
  const isDark = useIsDark();
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const horizontalPadding =
    width >= 980 ? LayoutTokens.screenHorizontalWide : LayoutTokens.screenHorizontal;
  const selectedModel = useSettingsStore((state) => state.selectedModel);
  const keyLoaded = useSettingsStore((state) => state.openRouterKeyLoaded);
  const configured = useSettingsStore((state) => state.openRouterConfigured);
  const modelName = selectedModel || DEFAULT_OPENROUTER_MODEL_ID;
  const { openTextAssistant } = useAssistantActions();

  const assistantContext = useMemo(
    () => ({
      surface: 'ai',
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
                Reasoning
              </Typography>
            </View>
          </View>
          <View style={styles.statusPill}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: configured ? Colors.successLight : Colors.warningLight },
              ]}
            />
            <Typography
              variant="tiny"
              color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
            >
              {configured ? 'CONNECTED' : 'NOT CONNECTED'}
            </Typography>
          </View>
        </View>

        <View style={styles.header}>
          <Typography
            variant="caption"
            color={isDark ? Colors.brandCyan : Colors.brandBlue}
            style={styles.eyebrow}
          >
            YOUR REASONING PARTNER
          </Typography>
          <Typography variant="display">Plan with AETHER.</Typography>
          <Typography
            variant="body"
            color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
            style={styles.subtitle}
          >
            Turn a loose intention into a thoughtful plan, then let the agent keep real tasks in
            sync.
          </Typography>
        </View>

        <View style={[styles.heroGrid, isWide && styles.heroGridWide]}>
          <Card variant="elevated" padding={Spacing.xl} style={styles.heroCard}>
            <View style={styles.heroIconRow}>
              <View
                style={[
                  styles.heroIcon,
                  {
                    backgroundColor: isDark
                      ? 'rgba(101, 214, 192, 0.14)'
                      : 'rgba(47, 124, 255, 0.10)',
                  },
                ]}
              >
                <Sparkles
                  size={24}
                  color={isDark ? Colors.brandCyan : Colors.brandBlue}
                  strokeWidth={2}
                />
              </View>
              <AetherMark size={54} muted={isDark} />
            </View>
            <Typography variant="headline" style={styles.heroTitle}>
              {configured ? 'Ready for your next instruction.' : 'Connect OpenRouter to begin.'}
            </Typography>
            <Typography
              variant="body"
              color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
            >
              Ask AETHER to plan, change, or explain what is already on your day. The assistant
              stays available through explicit text and voice actions.
            </Typography>
            <Button
              label={configured ? 'Ask AETHER' : 'Open Settings'}
              onPress={configured ? openTextAssistant : () => router.replace('/settings')}
              fullWidth={!isWide}
              icon={
                configured ? (
                  <Sparkles
                    size={17}
                    color={isDark ? Colors.brandInk : Colors.white}
                    strokeWidth={2.2}
                  />
                ) : (
                  <KeyRound
                    size={17}
                    color={isDark ? Colors.brandInk : Colors.white}
                    strokeWidth={2.3}
                  />
                )
              }
              style={styles.actionButton}
            />
          </Card>

          <Card variant="glass" padding={Spacing.lg} style={styles.connectionCard}>
            <View style={styles.connectionHeader}>
              <View style={styles.connectionIcon}>
                {configured ? (
                  <Check
                    size={19}
                    color={isDark ? Colors.successDark : Colors.successLight}
                    strokeWidth={2.4}
                  />
                ) : (
                  <KeyRound
                    size={19}
                    color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
                  />
                )}
              </View>
              <View style={styles.connectionCopy}>
                <Typography variant="caption" style={styles.eyebrow}>
                  OPENROUTER CONNECTION
                </Typography>
                <Typography variant="headline">
                  {configured ? 'Connected' : keyLoaded ? 'Needs attention' : 'Checking…'}
                </Typography>
              </View>
            </View>
            <View
              style={[
                styles.modelPanel,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.055)' : '#F7F9FC',
                  borderColor: isDark ? Colors.borderDark : Colors.borderLight,
                },
              ]}
            >
              <Typography
                variant="caption"
                color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
              >
                ACTIVE MODEL
              </Typography>
              <Typography variant="bodyBold" numberOfLines={1}>
                {modelName}
              </Typography>
            </View>
            <Typography
              variant="caption"
              color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
            >
              {configured
                ? 'AETHER can use task tools and preserve the existing data flow.'
                : 'The key is used only for AI reasoning and task tools.'}
            </Typography>
          </Card>
        </View>

        <Typography
          variant="caption"
          color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
          style={[styles.sectionLabel, styles.eyebrow]}
        >
          WHAT AETHER CAN DO
        </Typography>
        <View style={[styles.capabilityGrid, isWide && styles.capabilityGridWide]}>
          <Capability
            icon={<Brain size={19} />}
            title="Plan"
            copy="Turn an intention into dated, actionable tasks."
          />
          <Capability
            icon={<Wrench size={19} />}
            title="Change"
            copy="Complete, reopen, or update real tasks."
          />
          <Capability
            icon={<Check size={19} />}
            title="Explain"
            copy="Summarize the work already on your runway."
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Capability({
  icon,
  title,
  copy,
}: {
  icon: React.ReactElement<{ color?: string; strokeWidth?: number }>;
  title: string;
  copy: string;
}) {
  const isDark = useIsDark();
  const iconColor = isDark ? Colors.brandCyan : Colors.brandBlue;

  return (
    <Card variant="outline" padding={Spacing.md} style={styles.capability}>
      <View style={styles.capabilityIcon}>
        {React.cloneElement(icon, { color: iconColor, strokeWidth: 2.1 })}
      </View>
      <Typography variant="bodyBold" style={styles.capabilityTitle}>
        {title}
      </Typography>
      <Typography
        variant="caption"
        color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
      >
        {copy}
      </Typography>
    </Card>
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
  statusPill: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(47, 124, 255, 0.08)',
  },
  statusDot: {
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
    letterSpacing: 1.45,
  },
  subtitle: {
    maxWidth: 650,
    marginTop: Spacing.sm,
  },
  heroGrid: {
    gap: Spacing.md,
  },
  heroGridWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  heroCard: {
    flex: 1.08,
    gap: Spacing.md,
  },
  heroIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroIcon: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
  },
  heroTitle: {
    marginTop: Spacing.sm,
  },
  actionButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
  },
  connectionCard: {
    flex: 1,
    justifyContent: 'space-between',
    gap: Spacing.lg,
  },
  connectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  connectionIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: 'rgba(47, 124, 255, 0.09)',
  },
  connectionCopy: {
    flex: 1,
    gap: 3,
  },
  modelPanel: {
    gap: Spacing.xs,
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
  },
  sectionLabel: {
    marginTop: Spacing.md,
  },
  capabilityGrid: {
    gap: Spacing.sm,
  },
  capabilityGridWide: {
    flexDirection: 'row',
  },
  capability: {
    flex: 1,
    gap: Spacing.xs,
  },
  capabilityIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: 'rgba(47, 124, 255, 0.09)',
  },
  capabilityTitle: {
    marginTop: Spacing.xs,
  },
});
