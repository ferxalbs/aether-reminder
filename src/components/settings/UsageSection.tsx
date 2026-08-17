import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import {
  Sparkles,
  Mic,
  RefreshCw,
  AlertTriangle,
  Zap,
  ShieldCheck,
} from "lucide-react-native";

import { SettingsCard } from "./SettingsCard";
import { SettingsSectionHeader } from "./SettingsSectionHeader";
import { Typography } from "@/components/ui/Typography";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { useAetherUsage } from "@/hooks/useAetherUsage";
import { useAetherTheme } from "@/theme/useAetherTheme";
import { Hairline, Radius, Spacing } from "@/theme/tokens";

interface ProgressBarProps {
  label: string;
  icon: React.ReactNode;
  used: number;
  limit: number | null;
  remaining: number | null;
  unitLabel: string;
  formatValue?: (val: number) => string;
}

const UsageProgressBar: React.FC<ProgressBarProps> = ({
  label,
  icon,
  used,
  limit,
  remaining,
  unitLabel,
  formatValue = (v) => `${v}`,
}) => {
  const { colors } = useAetherTheme();
  const percentage =
    limit && limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;
  const isNearLimit = percentage >= 85;
  const isExhausted = remaining !== null && remaining <= 0;

  const barColor = isExhausted
    ? colors.destructive
    : isNearLimit
      ? colors.warning
      : colors.accent;

  const usedDisplay = formatValue(used);
  const limitDisplay = limit !== null ? formatValue(limit) : "Unlimited";

  return (
    <View style={styles.metricContainer}>
      <View style={styles.metricHeader}>
        <View style={styles.metricTitleRow}>
          <View style={styles.iconContainer}>{icon}</View>
          <Typography variant="bodyBold" style={{ color: colors.textPrimary }}>
            {label}
          </Typography>
        </View>
        <Typography variant="caption" style={{ color: colors.textSecondary }}>
          {usedDisplay} / {limitDisplay} {unitLabel}
        </Typography>
      </View>

      <View
        style={[styles.track, { backgroundColor: colors.surfaceRaised }]}
        accessibilityRole="progressbar"
        accessibilityLabel={`${label} usage`}
        accessibilityValue={{
          min: 0,
          max: limit ?? 100,
          now: used,
          text: `${usedDisplay} of ${limitDisplay} ${unitLabel} used`,
        }}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${percentage}%`,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>
    </View>
  );
};

export const UsageSection: React.FC = () => {
  const { colors } = useAetherTheme();
  const { snapshot, plan, state, errorMessage, refresh } = useAetherUsage();

  const renderContent = () => {
    if (state === "loading" && !snapshot) {
      return (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Typography
            variant="caption"
            style={{ color: colors.textSecondary, marginTop: Spacing.sm }}
          >
            Loading usage details...
          </Typography>
        </View>
      );
    }

    if (state === "unconfigured") {
      return (
        <View style={styles.stateContainer}>
          <AlertTriangle size={20} color={colors.textTertiary} />
          <Typography
            variant="body"
            style={{
              color: colors.textSecondary,
              textAlign: "center",
              marginTop: Spacing.xs,
            }}
          >
            AETHER Cloud is not configured in this development build.
          </Typography>
        </View>
      );
    }

    if (state === "unauthorized") {
      return (
        <View style={styles.stateContainer}>
          <AlertTriangle size={20} color={colors.warning} />
          <Typography
            variant="body"
            style={{
              color: colors.textPrimary,
              textAlign: "center",
              marginTop: Spacing.xs,
            }}
          >
            {errorMessage ?? "Sign in is required to refresh hosted usage."}
          </Typography>
        </View>
      );
    }

    if (state === "offline" || (state === "error" && !snapshot && !plan)) {
      return (
        <View style={styles.stateContainer}>
          <AlertTriangle size={20} color={colors.warning} />
          <Typography
            variant="body"
            style={{
              color: colors.textPrimary,
              textAlign: "center",
              marginTop: Spacing.xs,
            }}
          >
            {errorMessage ?? "Could not refresh usage."}
          </Typography>
          <AnimatedPressable
            onPress={() => refresh()}
            style={[
              styles.retryButton,
              { backgroundColor: colors.surfaceElevated },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Retry loading usage"
          >
            <RefreshCw size={14} color={colors.textPrimary} />
            <Typography
              variant="caption"
              style={{
                color: colors.textPrimary,
                marginLeft: Spacing.xs,
                fontWeight: "600",
              }}
            >
              Check Again
            </Typography>
          </AnimatedPressable>
        </View>
      );
    }

    if (snapshot) {
      const isPro = snapshot.plan.tier === "pro";
      const resetDate = snapshot.period.resetsAt
        ? new Date(snapshot.period.resetsAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })
        : null;

      const voiceUsedMin = snapshot.voice.usedSeconds / 60;
      const voiceLimitMin =
        snapshot.voice.limitSeconds !== null
          ? snapshot.voice.limitSeconds / 60
          : null;
      const voiceRemainingMin =
        snapshot.voice.remainingSeconds !== null
          ? snapshot.voice.remainingSeconds / 60
          : null;

      return (
        <View style={styles.loadedContainer}>
          {/* Plan badge & reset period header */}
          <View style={styles.planHeaderRow}>
            <View
              style={[
                styles.planBadge,
                {
                  backgroundColor: isPro
                    ? colors.accent
                    : colors.surfaceElevated,
                },
              ]}
            >
              {isPro ? (
                <Zap size={12} color={colors.onAccent} />
              ) : (
                <ShieldCheck size={12} color={colors.textPrimary} />
              )}
              <Typography
                variant="caption"
                style={{
                  color: isPro ? colors.onAccent : colors.textPrimary,
                  marginLeft: 4,
                  fontWeight: "600",
                }}
              >
                {snapshot.plan.displayName}
              </Typography>
            </View>

            {resetDate ? (
              <Typography
                variant="caption"
                style={{ color: colors.textTertiary }}
              >
                Resets {resetDate}
              </Typography>
            ) : null}
          </View>

          <View
            style={[styles.divider, { backgroundColor: colors.borderDefault }]}
          />

          {/* AI Metric */}
          <UsageProgressBar
            label="AI Assistant"
            icon={<Sparkles size={16} color={colors.accent} />}
            used={snapshot.ai.used}
            limit={snapshot.ai.limit}
            remaining={snapshot.ai.remaining}
            unitLabel="requests"
            formatValue={(v) => `${Math.round(v)}`}
          />

          {snapshot.automations ? (
            <UsageProgressBar
              label="Automations"
              icon={<Zap size={16} color={colors.accent} />}
              used={snapshot.automations.used}
              limit={snapshot.automations.limit}
              remaining={snapshot.automations.remaining}
              unitLabel="runs"
              formatValue={(v) => `${Math.round(v)}`}
            />
          ) : null}

          {snapshot.ai.remaining === 0 ||
          snapshot.voice.remainingSeconds === 0 ? (
            <Typography
              variant="caption"
              style={{ color: colors.warning, marginTop: Spacing.sm }}
            >
              A hosted allowance is exhausted. It will be available again when
              your period resets.
            </Typography>
          ) : null}

          {/* Voice Metric */}
          <UsageProgressBar
            label="Voice Capture"
            icon={<Mic size={16} color={colors.accent} />}
            used={voiceUsedMin}
            limit={voiceLimitMin}
            remaining={voiceRemainingMin}
            unitLabel="min"
            formatValue={(v) => `${v.toFixed(1)}`}
          />

          {/* Upgrade / Manage CTA */}
          <View style={styles.actionRow}>
            <AnimatedPressable
              onPress={() => {
                // Future billing / subscription flow integration
              }}
              style={[
                styles.ctaButton,
                {
                  backgroundColor: isPro
                    ? colors.surfaceElevated
                    : colors.accent,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                isPro ? "Manage Subscription" : "Upgrade to Pro"
              }
            >
              <Typography
                variant="bodyBold"
                style={{
                  color: isPro ? colors.textPrimary : colors.onAccent,
                }}
              >
                {isPro ? "Manage Subscription" : "Upgrade to Pro"}
              </Typography>
            </AnimatedPressable>
          </View>
        </View>
      );
    }

    if (plan) {
      return (
        <View style={styles.stateContainer}>
          <Typography variant="bodyBold" style={{ color: colors.textPrimary }}>
            {plan.displayName}
          </Typography>
          <Typography
            variant="caption"
            style={{
              color: colors.textPrimary,
              textAlign: "center",
              marginTop: Spacing.xs,
            }}
          >
            Usage unavailable. Your plan is still available to view.
          </Typography>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.section}>
      <SettingsSectionHeader title="USAGE" />
      <SettingsCard>{renderContent()}</SettingsCard>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: Spacing.lg,
  },
  stateContainer: {
    paddingVertical: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  loadedContainer: {
    paddingVertical: Spacing.xs,
  },
  planHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  planBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  divider: {
    height: Hairline.width,
    marginVertical: Spacing.sm,
  },
  metricContainer: {
    marginVertical: Spacing.xs,
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  metricTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  iconContainer: {
    width: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  track: {
    height: 6,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: Radius.pill,
  },
  actionRow: {
    marginTop: Spacing.md,
    paddingTop: Spacing.xs,
  },
  ctaButton: {
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    marginTop: Spacing.sm,
  },
});
