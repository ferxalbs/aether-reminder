import { useAssistantSurface } from "@/components/assistant/AssistantHost";
import {
  AetherAlertDialog,
  type AetherAlertDialogState,
} from "@/components/ui/AetherAlertDialog";
import { Typography } from "@/components/ui/Typography";
import {
  SettingsAccordion,
  SettingsPreferencesSection,
  SettingsSectionHeader,
  UsageSection,
} from "@/components/settings";
import { MotionDiagnosticsCard } from "@/motion/runtime/MotionDiagnosticsCard";
import { useMotionPreset } from "@/motion";
import { LayoutTokens, Spacing } from "@/theme/tokens";
import { useAetherTheme } from "@/theme/useAetherTheme";
import { useBottomChromeGeometry } from "@/theme/useBottomChromeGeometry";
import React, { useCallback, useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  useReducedMotion,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

const settingsEntering =
  Platform.OS === "ios"
    ? FadeInDown.duration(240).damping(20).stiffness(200)
    : undefined;

export default function SettingsScreen() {
  const reduceMotion = useReducedMotion();
  const enterPreset = useMotionPreset("navigation.push");
  const entering =
    reduceMotion || enterPreset.mode === "none" ? undefined : settingsEntering;

  const geometry = useBottomChromeGeometry();
  const aetherTheme = useAetherTheme();
  const { colors } = aetherTheme;

  // Alert Dialog State
  const [alertDialog, setAlertDialog] = useState<AetherAlertDialogState | null>(
    null,
  );

  const dismissAlert = useCallback(() => setAlertDialog(null), []);
  const showAlert = useCallback(
    (dialog: AetherAlertDialogState) => setAlertDialog(dialog),
    [],
  );

  const assistantContext = useMemo(
    () => ({
      surface: "settings",
      locale: Intl.DateTimeFormat().resolvedOptions().locale || "en-US",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      invocationSource: "app" as const,
    }),
    [],
  );
  useAssistantSurface(assistantContext);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[
        styles.safeArea,
        {
          backgroundColor: colors.background,
        },
      ]}
    >
      <StatusBar
        barStyle={
          aetherTheme.mode === "dark" ? "light-content" : "dark-content"
        }
      />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: geometry.settingsContentBottomInset },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={entering} style={styles.header}>
          <Typography variant="display" style={styles.headerTitle}>
            Settings
          </Typography>
          <Typography
            variant="body"
            color={colors.textSecondary}
            style={styles.headerSubtitle}
          >
            Preferences, hosted intelligence usage, and about.
          </Typography>
        </Animated.View>

        {/* Section 1: Hosted AI & Voice Usage */}
        <Animated.View entering={entering} style={styles.sectionContainer}>
          <UsageSection />
        </Animated.View>

        {/* Section 2: App Preferences */}
        <Animated.View entering={entering} style={styles.sectionContainer}>
          <SettingsSectionHeader title="APP PREFERENCES" />
          <SettingsPreferencesSection onShowAlert={showAlert} />
        </Animated.View>

        {/* Dev Diagnostics */}
        {__DEV__ ? (
          <Animated.View entering={entering} style={styles.sectionContainer}>
            <SettingsSectionHeader title="DIAGNOSTICS" />
            <MotionDiagnosticsCard />
          </Animated.View>
        ) : null}

        {/* Section 3: About & Privacy Accordions */}
        <Animated.View entering={entering} style={styles.sectionContainer}>
          <SettingsSectionHeader title="ABOUT & PRIVACY" />
          <SettingsAccordion />
        </Animated.View>

        {/* App Version Footer */}
        <View style={styles.versionFooter}>
          <Typography
            variant="tiny"
            align="center"
            color={colors.textTertiary}
            style={{ letterSpacing: 0.3 }}
          >
            AETHER v • Powered by AETHER Cloud • © 2026 Enosis Labs, Inc.
          </Typography>
        </View>
      </ScrollView>

      {/* Alert Dialog */}
      {alertDialog ? (
        <AetherAlertDialog
          {...alertDialog}
          visible
          onDismiss={dismissAlert}
          testID={alertDialog.testID ?? "settings-alert-dialog"}
        />
      ) : null}
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    width: "100%",
    maxWidth: LayoutTokens.contentMaxWidth,
    alignSelf: "center",
    paddingHorizontal: LayoutTokens.screenHorizontal,
    paddingTop: Spacing.xl,
  },
  header: {
    maxWidth: LayoutTokens.readingMaxWidth,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.xs,
  },
  headerTitle: {
    letterSpacing: -0.8,
  },
  headerSubtitle: {
    marginTop: Spacing.xs,
    lineHeight: 20,
  },
  sectionContainer: {
    marginBottom: Spacing.md,
  },
  versionFooter: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
    alignItems: "center",
  },
});
