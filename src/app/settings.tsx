import { useAssistantSurface } from "@/components/assistant/AssistantHost";
import {
  AetherAlertDialog,
  type AetherAlertDialogState,
} from "@/components/ui/AetherAlertDialog";
import { ModelCatalogSheet } from "@/components/ui/ModelCatalogSheet";
import { Typography } from "@/components/ui/Typography";
import {
  SettingsAccordion,
  SettingsApiKeyCard,
  SettingsModelSelector,
  SettingsPreferencesSection,
  SettingsSectionHeader,
  SettingsSecurityCard,
} from "@/components/settings";
import { reportNonFatalError } from "@/lib/nonFatalError";
import { MotionDiagnosticsCard } from "@/motion/runtime/MotionDiagnosticsCard";
import { useMotionPreset } from "@/motion";
import {
  type AIModel,
} from "@/services/ai/models";
import {
  fetchAvailableModels,
} from "@/services/ai/openrouter";
import { getAIErrorMessage } from "@/services/ai/providers";
import { useSettingsStore } from "@/stores/settings.store";
import { LayoutTokens, Spacing } from "@/theme/tokens";
import { useAetherTheme } from "@/theme/useAetherTheme";
import { useBottomChromeGeometry } from "@/theme/useBottomChromeGeometry";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

  const openRouterApiKey = useSettingsStore((s) => s.openRouterApiKey);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const loadCredentials = useSettingsStore((s) => s.loadCredentials);
  const setModel = useSettingsStore((s) => s.setModel);

  // Model catalog state
  const [models, setModels] = useState<AIModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);

  // Alert Dialog State
  const [alertDialog, setAlertDialog] =
    useState<AetherAlertDialogState | null>(null);

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

  useEffect(() => {
    void loadCredentials().catch((error: unknown) => {
      reportNonFatalError("settings-credentials-load", error);
    });
  }, [loadCredentials]);

  const loadModels = useCallback((forceRefresh = false) => {
    setModelsLoading(true);
    setModelsError(null);
    void fetchAvailableModels(openRouterApiKey, forceRefresh)
      .then(setModels)
      .catch((error: unknown) => setModelsError(getAIErrorMessage(error)))
      .finally(() => setModelsLoading(false));
  }, [openRouterApiKey]);

  useEffect(() => {
    let cancelled = false;
    void fetchAvailableModels(openRouterApiKey, false)
      .then((availableModels) => {
        if (!cancelled) setModels(availableModels);
      })
      .catch((error: unknown) => {
        if (!cancelled) setModelsError(getAIErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openRouterApiKey]);

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
            Configure intelligence, appearances, and preferences.
          </Typography>
        </Animated.View>

        {/* Section 1: OpenRouter AI Reasoning */}
        <Animated.View entering={entering} style={styles.sectionContainer}>
          <SettingsSectionHeader title="AI Reasoning" />
          <SettingsApiKeyCard
            provider="OpenRouter"
            onShowAlert={showAlert}
          />
        </Animated.View>

        {/* Section 2: OpenAI Realtime Transcription */}
        <Animated.View entering={entering} style={styles.sectionContainer}>
          <SettingsSectionHeader title="OpenAI — Realtime Transcription" />
          <SettingsApiKeyCard
            provider="OpenAI"
            onShowAlert={showAlert}
          />
        </Animated.View>

        {/* Section 3: OpenRouter Model Selection */}
        <Animated.View entering={entering} style={styles.sectionContainer}>
          <SettingsSectionHeader title="Model Selection" />
          <SettingsModelSelector
            models={models}
            onOpenModelCatalog={() => setModelPickerVisible(true)}
          />
        </Animated.View>

        {/* Section 4: App Preferences */}
        <Animated.View entering={entering} style={styles.sectionContainer}>
          <SettingsSectionHeader title="App Preferences" />
          <SettingsPreferencesSection onShowAlert={showAlert} />
        </Animated.View>

        {/* Section 5: Hardware Security & Storage */}
        <Animated.View entering={entering} style={styles.sectionContainer}>
          <SettingsSectionHeader title="Security Integrity" />
          <SettingsSecurityCard />
        </Animated.View>

        {/* Dev Diagnostics */}
        {__DEV__ ? (
          <Animated.View entering={entering} style={styles.sectionContainer}>
            <SettingsSectionHeader title="Diagnostics" />
            <MotionDiagnosticsCard />
          </Animated.View>
        ) : null}

        {/* Section 6: About & Privacy Accordions */}
        <Animated.View entering={entering} style={styles.sectionContainer}>
          <SettingsSectionHeader title="About & Legal" />
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
            AETHER v1.0.0 • Expo SDK 57
          </Typography>
        </View>
      </ScrollView>

      {/* Model Selector Native-First Sheet */}
      <ModelCatalogSheet
        visible={modelPickerVisible}
        onClose={() => setModelPickerVisible(false)}
        models={models}
        loading={modelsLoading}
        error={modelsError}
        selectedModelId={selectedModel}
        onSelectModel={(modelId) => setModel(modelId)}
        onRefresh={() => loadModels(true)}
      />

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
