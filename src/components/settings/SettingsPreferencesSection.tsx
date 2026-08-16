import React, { useCallback } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { Button } from "@/components/ui/Button";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Typography } from "@/components/ui/Typography";
import { selectionAsync } from "@/lib/haptics";
import { reportNonFatalError } from "@/lib/nonFatalError";
import { getAIErrorMessage } from "@/services/ai/providers";
import { useSettingsStore } from "@/stores/settings.store";
import { useTasksUiStore } from "@/stores/tasksUi.store";
import { Hairline, Radius, Spacing } from "@/theme/tokens";
import { useAetherTheme } from "@/theme/useAetherTheme";
import type { UserSettings } from "@/types";
import {
  Moon,
  Palette,
  RefreshCw,
  Sparkles,
  Vibrate,
} from "lucide-react-native";
import { SettingsCard } from "./SettingsCard";
import { SettingsHeaderRow } from "./SettingsHeaderRow";
import { SettingsRow } from "./SettingsRow";
import type { AetherAlertDialogState } from "@/components/ui/AetherAlertDialog";

export interface SettingsPreferencesSectionProps {
  onShowAlert: (dialog: AetherAlertDialogState) => void;
}

const THEME_OPTIONS: {
  value: UserSettings["theme"];
  label: string;
}[] = [
  { value: "system", label: "System" },
  { value: "dark", label: "OLED Dark" },
  { value: "light", label: "Light" },
];

export const SettingsPreferencesSection: React.FC<SettingsPreferencesSectionProps> = React.memo(
  ({ onShowAlert }) => {
    const aetherTheme = useAetherTheme();
    const { colors } = aetherTheme;

    const theme = useSettingsStore((s) => s.theme);
    const materialColorsEnabled = useSettingsStore(
      (s) => s.materialColorsEnabled,
    );
    const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
    const autoSummarize = useSettingsStore((s) => s.autoSummarize);
    const adaptiveNudgesEnabled = useSettingsStore(
      (s) => s.adaptiveNudgesEnabled,
    );

    const setTheme = useSettingsStore((s) => s.setTheme);
    const setMaterialColorsEnabled = useSettingsStore(
      (s) => s.setMaterialColorsEnabled,
    );
    const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
    const setAutoSummarize = useSettingsStore((s) => s.setAutoSummarize);
    const setAdaptiveNudgesPreference = useSettingsStore(
      (s) => s.setAdaptiveNudgesEnabled,
    );
    const persistAdaptiveNudges = useTasksUiStore(
      (s) => s.setAdaptiveNudgesEnabled,
    );
    const resetAdaptiveNudgeLearning = useTasksUiStore(
      (s) => s.resetAdaptiveNudgeLearning,
    );

    const handleThemeChange = useCallback(
      (val: UserSettings["theme"]) => {
        if (theme === val) return;
        setTheme(val);
        if (hapticsEnabled) {
          selectionAsync().catch((error: unknown) => {
            reportNonFatalError("haptics", error);
          });
        }
      },
      [theme, setTheme, hapticsEnabled],
    );

    const handleAdaptiveNudgesToggle = useCallback(
      async (enabled: boolean) => {
        try {
          await persistAdaptiveNudges(enabled);
          setAdaptiveNudgesPreference(enabled);
        } catch (error) {
          onShowAlert({
            title: "Adaptive Nudges Not Updated",
            message: getAIErrorMessage(error),
            actions: [{ label: "OK" }],
          });
        }
      },
      [persistAdaptiveNudges, setAdaptiveNudgesPreference, onShowAlert],
    );

    const handleResetLearning = useCallback(() => {
      onShowAlert({
        title: "Reset learned nudge behavior?",
        message:
          "This clears local completion and snooze learning. Tasks, recurrence rules, and ordinary reminders stay unchanged.",
        actions: [
          { label: "Cancel", role: "cancel" },
          {
            label: "Reset learning",
            role: "destructive",
            onPress: () => {
              void resetAdaptiveNudgeLearning()
                .then(() => {
                  onShowAlert({
                    title: "Learning reset",
                    message: "AETHER will use its conservative baseline again.",
                    actions: [{ label: "OK" }],
                  });
                })
                .catch((error: unknown) => {
                  onShowAlert({
                    title: "Learning Not Reset",
                    message: getAIErrorMessage(error),
                    actions: [{ label: "OK" }],
                  });
                });
            },
          },
        ],
      });
    }, [resetAdaptiveNudgeLearning, onShowAlert]);

    return (
      <SettingsCard>
        {/* Theme Preference */}
        <View style={styles.themeSection}>
          <SettingsHeaderRow
            icon={<Moon size={20} color={colors.accent} />}
            title="Theme Preference"
            subtitle="Choose your preferred appearance"
          />

          <View
            style={[
              styles.segmentedContainer,
              {
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.borderDefault,
              },
            ]}
          >
            {THEME_OPTIONS.map((option) => {
              const isActive = theme === option.value;
              return (
                <AnimatedPressable
                  key={option.value}
                  onPress={() => handleThemeChange(option.value)}
                  scaleTo={0.96}
                  style={[
                    styles.segmentedItem,
                    {
                      backgroundColor: isActive
                        ? colors.accent
                        : "transparent",
                    },
                  ]}
                  android_ripple={{
                    color: colors.ripple,
                    foreground: true,
                  }}
                  interactionRadius={Radius.pill}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`Select ${option.label} theme`}
                >
                  <Typography
                    variant="caption"
                    style={{
                      color: isActive
                        ? colors.onAccent
                        : colors.textSecondary,
                      fontWeight: isActive ? "600" : "500",
                    }}
                  >
                    {option.label}
                  </Typography>
                </AnimatedPressable>
              );
            })}
          </View>
        </View>

        {/* Material You Dynamic Colors (Android 12+) */}
        {Platform.OS === "android" ? (
          <>
            <View
              style={[
                styles.divider,
                { backgroundColor: colors.borderDefault },
              ]}
            />
            <SettingsRow
              icon={<Palette size={20} color={colors.accent} />}
              title="Dynamic Colors"
              description={
                aetherTheme.isDynamicColorAvailable
                  ? "Use wallpaper-derived Material You accents"
                  : "Requires Android 12; monochrome theme is active"
              }
              trailing={
                <ToggleSwitch
                  value={
                    materialColorsEnabled &&
                    aetherTheme.isDynamicColorAvailable
                  }
                  onValueChange={setMaterialColorsEnabled}
                  disabled={!aetherTheme.isDynamicColorAvailable}
                  accessibilityLabel="Dynamic Colors"
                  accessibilityHint="Use wallpaper-derived Material You accents on Android 12 and later"
                />
              }
            />
          </>
        ) : null}

        <View
          style={[styles.divider, { backgroundColor: colors.borderDefault }]}
        />

        {/* Haptic Feedback */}
        <SettingsRow
          icon={<Vibrate size={20} color={colors.accent} />}
          title="Haptic Feedback"
          description="Tactile touch responses on actions"
          trailing={
            <ToggleSwitch
              value={hapticsEnabled}
              onValueChange={setHapticsEnabled}
              accessibilityLabel="Haptic Feedback"
            />
          }
        />

        <View
          style={[styles.divider, { backgroundColor: colors.borderDefault }]}
        />

        {/* Auto Task Summarize */}
        <SettingsRow
          icon={<Sparkles size={20} color={colors.accent} />}
          title="Auto Task Summarize"
          description="Automatically suggest task details with AI"
          trailing={
            <ToggleSwitch
              value={autoSummarize}
              onValueChange={setAutoSummarize}
              accessibilityLabel="Auto Task Summarize"
            />
          }
        />

        <View
          style={[styles.divider, { backgroundColor: colors.borderDefault }]}
        />

        {/* Adaptive Nudges */}
        <SettingsRow
          icon={<RefreshCw size={20} color={colors.accent} />}
          title="Adaptive Nudges"
          description="AETHER learns completion and snooze patterns to refine reminder follow-up timings."
          trailing={
            <ToggleSwitch
              value={adaptiveNudgesEnabled}
              onValueChange={(val) => void handleAdaptiveNudgesToggle(val)}
              accessibilityLabel="Adaptive Nudges"
            />
          }
        />

        {/* Reset Nudge Learning Button */}
        <View style={styles.resetContainer}>
          <Button
            label="Reset learned nudge behavior"
            onPress={handleResetLearning}
            variant="secondary"
            fullWidth
          />
        </View>
      </SettingsCard>
    );
  },
);

SettingsPreferencesSection.displayName = "SettingsPreferencesSection";

const styles = StyleSheet.create({
  themeSection: {
    marginBottom: Spacing.xs,
  },
  segmentedContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 3,
    borderRadius: Radius.pill,
    borderWidth: Hairline.width,
    marginTop: Spacing.md,
  },
  segmentedItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: Radius.pill,
  },
  divider: {
    height: Hairline.width,
    marginVertical: Spacing.sm,
  },
  resetContainer: {
    marginTop: Spacing.md,
  },
});
