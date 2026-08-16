import { useAssistantSurface } from "@/components/assistant/AssistantHost";
import {
  AetherAlertDialog,
  type AetherAlertDialogState,
} from "@/components/ui/AetherAlertDialog";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ModelCatalogSheet } from "@/components/ui/ModelCatalogSheet";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Typography } from "@/components/ui/Typography";
import { notificationAsync } from "@/lib/haptics";
import { reportNonFatalError } from "@/lib/nonFatalError";
import {
  DEFAULT_OPENROUTER_MODEL_ID,
  type AIModel,
} from "@/services/ai/models";
import {
  fetchAvailableModels,
  testOpenRouterConnection,
} from "@/services/ai/openrouter";
import { getAIErrorMessage } from "@/services/ai/providers";
import { testOpenAIRealtimeConnection } from "@/services/transcription";
import { useSettingsStore } from "@/stores/settings.store";
import { useTasksUiStore } from "@/stores/tasksUi.store";
import { LayoutTokens, Radius, Spacing } from "@/theme/tokens";
import { MotionDiagnosticsCard } from "@/motion/runtime/MotionDiagnosticsCard";
import { useMotionPreset } from "@/motion";
import { useBottomChromeGeometry } from "@/theme/useBottomChromeGeometry";
import { useAetherTheme } from "@/theme/useAetherTheme";
import type { UserSettings } from "@/types";
import * as Haptics from "expo-haptics";
import {
  ChevronDown,
  Cpu,
  Eye,
  EyeOff,
  Info,
  Key,
  Lock,
  Mic,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  Trash2,
  Vibrate,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  Layout,
  useReducedMotion,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

const settingsEntering =
  Platform.OS === "ios"
    ? FadeInDown.duration(240).damping(20).stiffness(200)
    : undefined;
const settingsLayout =
  Platform.OS === "ios"
    ? Layout.springify().damping(20).stiffness(200)
    : undefined;

type ProviderName = "OpenRouter" | "OpenAI";

export default function SettingsScreen() {
  const reduceMotion = useReducedMotion();
  const enterPreset = useMotionPreset("navigation.push");
  const entering =
    reduceMotion || enterPreset.mode === "none" ? undefined : settingsEntering;
  const geometry = useBottomChromeGeometry();
  const theme = useSettingsStore((s) => s.theme);
  const openRouterApiKey = useSettingsStore((s) => s.openRouterApiKey);
  const openAiApiKey = useSettingsStore((s) => s.openAiApiKey);
  const openRouterKeyLoaded = useSettingsStore((s) => s.openRouterKeyLoaded);
  const openAiKeyLoaded = useSettingsStore((s) => s.openAiKeyLoaded);
  const openRouterConfigured = useSettingsStore((s) => s.openRouterConfigured);
  const openAiConfigured = useSettingsStore((s) => s.openAiConfigured);
  const secureStoreAvailable = useSettingsStore((s) => s.secureStoreAvailable);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const materialColorsEnabled = useSettingsStore(
    (s) => s.materialColorsEnabled,
  );
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const autoSummarize = useSettingsStore((s) => s.autoSummarize);
  const adaptiveNudgesEnabled = useSettingsStore(
    (s) => s.adaptiveNudgesEnabled,
  );

  const loadCredentials = useSettingsStore((s) => s.loadCredentials);
  const setOpenRouterApiKey = useSettingsStore((s) => s.setOpenRouterApiKey);
  const deleteOpenRouterApiKey = useSettingsStore(
    (s) => s.deleteOpenRouterApiKey,
  );
  const setOpenAiApiKey = useSettingsStore((s) => s.setOpenAiApiKey);
  const deleteOpenAiApiKey = useSettingsStore((s) => s.deleteOpenAiApiKey);
  const setModel = useSettingsStore((s) => s.setModel);
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

  const [openRouterInput, setOpenRouterInput] = useState("");
  const [openAiInput, setOpenAiInput] = useState("");
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [savingProvider, setSavingProvider] = useState<ProviderName | null>(
    null,
  );
  const [testingProvider, setTestingProvider] = useState<ProviderName | null>(
    null,
  );
  const [openRouterMessage, setOpenRouterMessage] = useState<string | null>(
    null,
  );
  const [openAiMessage, setOpenAiMessage] = useState<string | null>(null);

  const [models, setModels] = useState<AIModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Model Catalog Sheet State
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [alertDialog, setAlertDialog] =
    useState<AetherAlertDialogState | null>(null);

  const dismissAlert = () => setAlertDialog(null);
  const showAlert = (dialog: AetherAlertDialogState) => setAlertDialog(dialog);

  const aetherTheme = useAetherTheme();
  const { colors } = aetherTheme;
  const keyStateLoaded = openRouterKeyLoaded && openAiKeyLoaded;

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

  const loadModels = (forceRefresh = false) => {
    setModelsLoading(true);
    setModelsError(null);
    void fetchAvailableModels(openRouterApiKey, forceRefresh)
      .then(setModels)
      .catch((error: unknown) => setModelsError(getAIErrorMessage(error)))
      .finally(() => setModelsLoading(false));
  };

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

  const activeModelDetails = useMemo(() => {
    const found = models.find((m) => m.id === selectedModel);
    if (found) return found;
    return {
      id: selectedModel,
      name: selectedModel.split("/").pop() || selectedModel,
      provider: selectedModel.split("/")[0] || "OpenRouter",
      availability: "available" as const,
    };
  }, [models, selectedModel]);

  const saveKey = async (provider: ProviderName) => {
    const input = provider === "OpenRouter" ? openRouterInput : openAiInput;
    if (!input.trim()) {
      showAlert({
        title: "API Key Required",
        message: `Enter an ${provider} API key before saving.`,
        actions: [{ label: "OK" }],
      });
      return;
    }
    setSavingProvider(provider);
    const setKey =
      provider === "OpenRouter" ? setOpenRouterApiKey : setOpenAiApiKey;
    try {
      await setKey(input);
      if (provider === "OpenRouter") {
        setOpenRouterInput("");
        setShowOpenRouterKey(false);
        setOpenRouterMessage("OpenRouter key saved securely in SecureStore.");
      } else {
        setOpenAiInput("");
        setShowOpenAiKey(false);
        setOpenAiMessage("OpenAI key saved securely in SecureStore.");
      }
      if (hapticsEnabled) {
        notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          (error: unknown) => {
            reportNonFatalError("haptics", error);
          },
        );
      }
    } catch (error) {
      showAlert({
        title: `${provider} Key Not Saved`,
        message: getAIErrorMessage(error),
        actions: [{ label: "OK" }],
      });
    } finally {
      setSavingProvider(null);
    }
  };

  const testConnection = async (provider: ProviderName) => {
    const input = provider === "OpenRouter" ? openRouterInput : openAiInput;
    const savedKey =
      provider === "OpenRouter" ? openRouterApiKey : openAiApiKey;
    const keyToTest = input.trim() || savedKey;
    if (!keyToTest) {
      showAlert({
        title: "API Key Required",
        message: `Save an ${provider} key or enter one to test.`,
        actions: [{ label: "OK" }],
      });
      return;
    }
    setTestingProvider(provider);
    try {
      const result =
        provider === "OpenRouter"
          ? await testOpenRouterConnection(keyToTest)
          : await testOpenAIRealtimeConnection(keyToTest);
      const message = `✓ ${result.provider} API connection verified.`;
      if (provider === "OpenRouter") setOpenRouterMessage(message);
      else setOpenAiMessage(message);
      if (hapticsEnabled) {
        notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          (error: unknown) => {
            reportNonFatalError("haptics", error);
          },
        );
      }
    } catch (error) {
      const message = `✕ ${getAIErrorMessage(error)}`;
      if (provider === "OpenRouter") setOpenRouterMessage(message);
      else setOpenAiMessage(message);
    } finally {
      setTestingProvider(null);
    }
  };

  const deleteKey = (provider: ProviderName) => {
    const configured =
      provider === "OpenRouter" ? openRouterConfigured : openAiConfigured;
    if (!configured) {
      if (provider === "OpenRouter") setOpenRouterInput("");
      else setOpenAiInput("");
      return;
    }
    showAlert({
      title: `Delete ${provider} API Key?`,
      message:
        provider === "OpenRouter"
          ? "This disables AI reasoning and automated task actions until another OpenRouter key is saved."
          : "This disables realtime voice transcription until another OpenAI key is saved.",
      actions: [
        { label: "Cancel", role: "cancel" },
        {
          label: "Delete Key",
          role: "destructive",
          onPress: () => {
            const deleteSavedKey =
              provider === "OpenRouter"
                ? deleteOpenRouterApiKey
                : deleteOpenAiApiKey;
            void deleteSavedKey()
              .then(() => {
                if (provider === "OpenRouter") {
                  setOpenRouterInput("");
                  setOpenRouterMessage(
                    "OpenRouter key deleted from SecureStore.",
                  );
                } else {
                  setOpenAiInput("");
                  setOpenAiMessage("OpenAI key deleted from SecureStore.");
                }
                if (hapticsEnabled) {
                  notificationAsync(
                    Haptics.NotificationFeedbackType.Warning,
                  ).catch((error: unknown) => {
                    reportNonFatalError("haptics", error);
                  });
                }
              })
              .catch((error: unknown) => {
                showAlert({
                  title: `${provider} Key Not Deleted`,
                  message: getAIErrorMessage(error),
                  actions: [{ label: "OK" }],
                });
              });
          },
        },
      ],
    });
  };

  const setAdaptiveNudges = async (enabled: boolean) => {
    try {
      await persistAdaptiveNudges(enabled);
      setAdaptiveNudgesPreference(enabled);
    } catch (error) {
      showAlert({
        title: "Adaptive Nudges Not Updated",
        message: getAIErrorMessage(error),
        actions: [{ label: "OK" }],
      });
    }
  };

  const confirmResetAdaptiveLearning = () => {
    showAlert({
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
                showAlert({
                  title: "Learning reset",
                  message: "AETHER will use its conservative baseline again.",
                  actions: [{ label: "OK" }],
                });
              })
              .catch((error: unknown) => {
                showAlert({
                  title: "Learning Not Reset",
                  message: getAIErrorMessage(error),
                  actions: [{ label: "OK" }],
                });
              });
          },
        },
      ],
    });
  };

  const storageDescription = !keyStateLoaded
    ? "Checking secure hardware storage…"
    : secureStoreAvailable
      ? "Keys are encrypted locally in Expo SecureStore. Only non-secret preferences use local storage."
      : "Secure storage is unavailable in this environment.";

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
        </Animated.View>

        {/* Section 1: OpenRouter AI Reasoning */}
        <Animated.View entering={entering}>
          <Typography
            variant="caption"
            color={colors.textSecondary}
            style={styles.sectionHeader}
          >
            AI Reasoning
          </Typography>
          <Card variant="outline" style={styles.cardSection}>
            <View style={styles.cardHeaderRow}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.borderDefault,
                    borderWidth: 1,
                  },
                ]}
              >
                <Key size={18} color={colors.textPrimary} />
              </View>
              <View style={styles.headerTextGroup}>
                <Typography variant="title">OpenRouter API Key</Typography>
                <Typography variant="caption" color={colors.textSecondary}>
                  Powers AETHER’s tool reasoning agent.
                </Typography>
              </View>
            </View>

            <View
              style={[
                styles.statusBanner,
                {
                  backgroundColor: colors.surfaceRaised,
                  borderColor: colors.borderDefault,
                  borderWidth: 1,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Typography
                  variant="tiny"
                  color={
                    openRouterConfigured
                      ? colors.textPrimary
                      : colors.textSecondary
                  }
                >
                  KEY STATUS
                </Typography>
                <Typography
                  variant="bodyBold"
                  style={{ color: colors.textPrimary }}
                >
                  {openRouterKeyLoaded
                    ? openRouterConfigured
                      ? "Saved in SecureStore"
                      : "No key configured"
                    : "Checking SecureStore…"}
                </Typography>
              </View>
              {openRouterConfigured && (
                <Shield size={18} color={colors.textPrimary} />
              )}
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                value={openRouterInput}
                onChangeText={setOpenRouterInput}
                placeholder={
                  openRouterConfigured
                    ? "••••••••••••••••••••••••"
                    : "Enter OpenRouter API Key"
                }
                placeholderTextColor={colors.textTertiary}
                secureTextEntry={!showOpenRouterKey}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.textInput,
                  {
                    color: colors.textPrimary,
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.borderDefault,
                  },
                ]}
              />
              <AnimatedPressable
                onPress={() => {
                  setShowOpenRouterKey((v) => !v);
                }}
                style={styles.eyeButton}
                accessibilityLabel={showOpenRouterKey ? "Hide key" : "Show key"}
              >
                {showOpenRouterKey ? (
                  <EyeOff size={18} color={colors.textTertiary} />
                ) : (
                  <Eye size={18} color={colors.textTertiary} />
                )}
              </AnimatedPressable>
            </View>

            <Typography
              variant="caption"
              color={colors.textTertiary}
              style={styles.storageNote}
            >
              {storageDescription}
            </Typography>

            <View style={styles.buttonStack}>
              <Button
                label="Save Key"
                onPress={() => void saveKey("OpenRouter")}
                variant={openRouterConfigured ? "secondary" : "primary"}
                loading={savingProvider === "OpenRouter"}
                disabled={
                  !secureStoreAvailable ||
                  !openRouterKeyLoaded ||
                  testingProvider !== null ||
                  !openRouterInput.trim()
                }
                fullWidth
              />
              <Button
                label="Test Connection"
                onPress={() => void testConnection("OpenRouter")}
                variant="secondary"
                loading={testingProvider === "OpenRouter"}
                disabled={!openRouterKeyLoaded || savingProvider !== null}
                fullWidth
              />
              {openRouterConfigured || openRouterInput.trim() ? (
                <Button
                  label="Delete Key"
                  onPress={() => deleteKey("OpenRouter")}
                  variant="destructive"
                  icon={<Trash2 size={16} color={colors.textPrimary} />}
                  disabled={
                    !openRouterKeyLoaded ||
                    savingProvider !== null ||
                    testingProvider !== null
                  }
                  fullWidth
                />
              ) : null}
            </View>

            {openRouterMessage ? (
              <Typography
                variant="caption"
                color={colors.textPrimary}
                style={styles.statusMessage}
              >
                {openRouterMessage}
              </Typography>
            ) : null}
          </Card>
        </Animated.View>

        {/* Section 2: OpenAI Realtime Transcription */}
        <Animated.View entering={entering}>
          <Typography
            variant="caption"
            color={colors.textSecondary}
            style={styles.sectionHeader}
          >
            OPENAI — REALTIME TRANSCRIPTION
          </Typography>
          <Card variant="outline" style={styles.cardSection}>
            <View style={styles.cardHeaderRow}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.borderDefault,
                    borderWidth: 1,
                  },
                ]}
              >
                <Mic size={18} color={colors.textPrimary} />
              </View>
              <View style={styles.headerTextGroup}>
                <Typography variant="title">OpenAI API Key</Typography>
                <Typography variant="caption" color={colors.textSecondary}>
                  Used strictly for realtime voice transcription.
                </Typography>
              </View>
            </View>

            <View
              style={[
                styles.statusBanner,
                {
                  backgroundColor: colors.surfaceRaised,
                  borderColor: colors.borderDefault,
                  borderWidth: 1,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Typography
                  variant="tiny"
                  color={
                    openAiConfigured ? colors.textPrimary : colors.textSecondary
                  }
                >
                  KEY STATUS
                </Typography>
                <Typography
                  variant="bodyBold"
                  style={{ color: colors.textPrimary }}
                >
                  {openAiKeyLoaded
                    ? openAiConfigured
                      ? "Saved in SecureStore"
                      : "No key configured"
                    : "Checking SecureStore…"}
                </Typography>
              </View>
              {openAiConfigured && (
                <Shield size={18} color={colors.textPrimary} />
              )}
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                value={openAiInput}
                onChangeText={setOpenAiInput}
                placeholder={
                  openAiConfigured
                    ? "••••••••••••••••••••••••"
                    : "Enter OpenAI API Key"
                }
                placeholderTextColor={colors.textTertiary}
                secureTextEntry={!showOpenAiKey}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.textInput,
                  {
                    color: colors.textPrimary,
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.borderDefault,
                  },
                ]}
              />
              <AnimatedPressable
                onPress={() => {
                  setShowOpenAiKey((v) => !v);
                }}
                style={styles.eyeButton}
                accessibilityLabel={showOpenAiKey ? "Hide key" : "Show key"}
              >
                {showOpenAiKey ? (
                  <EyeOff size={18} color={colors.textTertiary} />
                ) : (
                  <Eye size={18} color={colors.textTertiary} />
                )}
              </AnimatedPressable>
            </View>

            <Typography
              variant="caption"
              color={colors.textTertiary}
              style={styles.storageNote}
            >
              {storageDescription}
            </Typography>

            <View style={styles.buttonStack}>
              <Button
                label="Save Key"
                onPress={() => void saveKey("OpenAI")}
                variant={openAiConfigured ? "secondary" : "primary"}
                loading={savingProvider === "OpenAI"}
                disabled={
                  !secureStoreAvailable ||
                  !openAiKeyLoaded ||
                  testingProvider !== null ||
                  !openAiInput.trim()
                }
                fullWidth
              />
              <Button
                label="Test Connection"
                onPress={() => void testConnection("OpenAI")}
                variant="secondary"
                loading={testingProvider === "OpenAI"}
                disabled={!openAiKeyLoaded || savingProvider !== null}
                fullWidth
              />
              {openAiConfigured || openAiInput.trim() ? (
                <Button
                  label="Delete Key"
                  onPress={() => deleteKey("OpenAI")}
                  variant="destructive"
                  icon={<Trash2 size={16} color={colors.textPrimary} />}
                  disabled={
                    !openAiKeyLoaded ||
                    savingProvider !== null ||
                    testingProvider !== null
                  }
                  fullWidth
                />
              ) : null}
            </View>

            {openAiMessage ? (
              <Typography
                variant="caption"
                color={colors.textPrimary}
                style={styles.statusMessage}
              >
                {openAiMessage}
              </Typography>
            ) : null}
          </Card>
        </Animated.View>

        {/* Section 3: OpenRouter Model Selection */}
        <Animated.View entering={entering}>
          <Typography
            variant="caption"
            color={colors.textSecondary}
            style={styles.sectionHeader}
          >
            MODEL SELECTION
          </Typography>
          <Card variant="outline" style={styles.cardSection}>
            <View style={styles.cardHeaderRow}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.borderDefault,
                    borderWidth: 1,
                  },
                ]}
              >
                <Cpu size={18} color={colors.textPrimary} />
              </View>
              <View style={styles.headerTextGroup}>
                <Typography variant="title">Tool-Enabled Model</Typography>
                <Typography variant="caption" color={colors.textSecondary}>
                  Active: {activeModelDetails.name}
                </Typography>
              </View>
            </View>

            {/* Active Model Card */}
            <View
              style={[
                styles.activeModelCard,
                {
                  backgroundColor: colors.surfaceRaised,
                  borderColor: colors.borderDefault,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Typography
                  variant="tiny"
                  color={colors.textSecondary}
                  style={{ letterSpacing: 0.5 }}
                >
                  SELECTED MODEL ID
                </Typography>
                <Typography variant="bodyBold" style={{ marginTop: 2 }}>
                  {selectedModel}
                </Typography>
                <Typography
                  variant="tiny"
                  color={colors.textTertiary}
                  style={{ marginTop: 2 }}
                >
                  Provider: {activeModelDetails.provider}
                </Typography>
              </View>

              {selectedModel !== DEFAULT_OPENROUTER_MODEL_ID ? (
                <AnimatedPressable
                  onPress={() => {
                    setModel(DEFAULT_OPENROUTER_MODEL_ID);
                  }}
                  style={[
                    styles.resetButton,
                    {
                      borderColor: colors.borderDefault,
                    },
                  ]}
                  android_ripple={{ color: colors.ripple, foreground: true }}
                  interactionRadius={Radius.pill}
                  accessibilityLabel="Reset model to default"
                >
                  <RotateCcw size={14} color={colors.textPrimary} />
                  <Typography
                    variant="tiny"
                    style={{ color: colors.textPrimary }}
                  >
                    Reset
                  </Typography>
                </AnimatedPressable>
              ) : (
                <View
                  style={[
                    styles.defaultBadge,
                    {
                      backgroundColor: colors.borderDefault,
                    },
                  ]}
                >
                  <Typography variant="tiny" color={colors.textPrimary}>
                    Default
                  </Typography>
                </View>
              )}
            </View>

            <AnimatedPressable
              onPress={() => {
                setModelPickerVisible(true);
              }}
              scaleTo={0.98}
              style={[
                styles.pullDownButton,
                {
                  backgroundColor: colors.surfaceRaised,
                  borderColor: colors.borderDefault,
                },
              ]}
              android_ripple={{ color: colors.ripple, foreground: true }}
              interactionRadius={Radius.md}
            >
              <Typography variant="bodyBold" style={{ flex: 1 }}>
                Change Reasoning Model…
              </Typography>
              <ChevronDown size={18} color={colors.textSecondary} />
            </AnimatedPressable>
          </Card>
        </Animated.View>

        {/* Section 4: App Preferences */}
        <Animated.View entering={entering}>
          <Typography
            variant="caption"
            color={colors.textSecondary}
            style={styles.sectionHeader}
          >
            APP PREFERENCES
          </Typography>
          <Card variant="outline" style={styles.cardSection}>
            {/* Segmented Control for Theme Preference */}
            <View style={{ marginBottom: Spacing.xs }}>
              <View style={styles.cardHeaderRow}>
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: colors.surfaceRaised,
                      borderColor: colors.borderDefault,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Moon size={18} color={colors.textPrimary} />
                </View>
                <Typography variant="bodyBold" style={{ flex: 1 }}>
                  Theme Preference
                </Typography>
              </View>

              <View
                style={[
                  styles.segmentedContainer,
                  {
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.borderDefault,
                  },
                ]}
              >
                {(["dark", "light", "system"] as UserSettings["theme"][]).map(
                  (val) => {
                    const isActive = theme === val;
                    const label =
                      val === "system"
                        ? "System"
                        : val === "dark"
                          ? "OLED Dark"
                          : "Light";
                    return (
                      <AnimatedPressable
                        key={val}
                        onPress={() => {
                          setTheme(val);
                        }}
                        scaleTo={0.97}
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
                          {label}
                        </Typography>
                      </AnimatedPressable>
                    );
                  },
                )}
              </View>
            </View>

            <View
              style={[
                styles.divider,
                {
                  backgroundColor: colors.borderDefault,
                },
              ]}
            />

            {/* Android-only Material You preference */}
            {Platform.OS === "android" ? (
              <View style={styles.rowBetween}>
                <View style={styles.rowLeftGroup}>
                  <View
                    style={[
                      styles.iconCircle,
                      {
                        backgroundColor: colors.surfaceRaised,
                        borderColor: colors.borderDefault,
                        borderWidth: 1,
                      },
                    ]}
                  >
                    <Palette size={18} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Typography variant="bodyBold">Dynamic Colors</Typography>
                    <Typography variant="tiny" color={colors.textSecondary}>
                      {aetherTheme.isDynamicColorAvailable
                        ? "Use wallpaper-derived Material You accents"
                        : "Material You requires Android 12; AETHER monochrome is active"}
                    </Typography>
                  </View>
                </View>
                <ToggleSwitch
                  value={
                    materialColorsEnabled &&
                    aetherTheme.isDynamicColorAvailable
                  }
                  onValueChange={setMaterialColorsEnabled}
                  disabled={!aetherTheme.isDynamicColorAvailable}
                  accessibilityLabel="Dynamic colors"
                  accessibilityHint="Use wallpaper-derived Material You accents on Android 12 and later"
                />
              </View>
            ) : null}

            <View
              style={[
                styles.divider,
                {
                  backgroundColor: colors.borderDefault,
                },
              ]}
            />

            {/* Haptic Feedback Switch */}
            <View style={styles.rowBetween}>
              <View style={styles.rowLeftGroup}>
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: colors.surfaceRaised,
                      borderColor: colors.borderDefault,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Vibrate size={18} color={colors.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Typography variant="bodyBold">Haptic Feedback</Typography>
                  <Typography variant="tiny" color={colors.textSecondary}>
                    Tactile touch responses on actions
                  </Typography>
                </View>
              </View>
              <ToggleSwitch
                value={hapticsEnabled}
                onValueChange={(enabled) => setHapticsEnabled(enabled)}
                accessibilityLabel="Haptic Feedback"
              />
            </View>

            <View
              style={[
                styles.divider,
                {
                  backgroundColor: colors.borderDefault,
                },
              ]}
            />

            {/* Auto Task Summarize Switch */}
            <View style={styles.rowBetween}>
              <View style={styles.rowLeftGroup}>
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: colors.surfaceRaised,
                      borderColor: colors.borderDefault,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Sparkles size={18} color={colors.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Typography variant="bodyBold">
                    Auto Task Summarize
                  </Typography>
                  <Typography variant="tiny" color={colors.textSecondary}>
                    Automatically suggest task details with AI
                  </Typography>
                </View>
              </View>
              <ToggleSwitch
                value={autoSummarize}
                onValueChange={(enabled) => setAutoSummarize(enabled)}
                accessibilityLabel="Auto Task Summarize"
              />
            </View>

            <View
              style={[
                styles.divider,
                {
                  backgroundColor: colors.borderDefault,
                },
              ]}
            />

            {/* Adaptive Nudge Switch */}
            <View style={styles.rowBetween}>
              <View style={styles.rowLeftGroup}>
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: colors.surfaceRaised,
                      borderColor: colors.borderDefault,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <RefreshCw size={18} color={colors.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Typography variant="bodyBold">Adaptive Nudges</Typography>
                  <Typography variant="tiny" color={colors.textSecondary}>
                    AETHER can learn from completion and snooze patterns to
                    choose better follow-up times.
                  </Typography>
                </View>
              </View>
              <ToggleSwitch
                value={adaptiveNudgesEnabled}
                onValueChange={(enabled) => void setAdaptiveNudges(enabled)}
                accessibilityLabel="Adaptive Nudges"
              />
            </View>

            <Button
              label="Reset learned nudge behavior"
              onPress={confirmResetAdaptiveLearning}
              variant="secondary"
              fullWidth
            />
          </Card>
        </Animated.View>

        {/* Section 5: Hardware Security & Storage */}
        <Animated.View entering={entering}>
          <Typography
            variant="caption"
            color={colors.textSecondary}
            style={styles.sectionHeader}
          >
            SECURITY INTEGRITY
          </Typography>
          <Card variant="outline" style={styles.cardSection}>
            <View style={styles.cardHeaderRow}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.borderDefault,
                    borderWidth: 1,
                  },
                ]}
              >
                <Lock size={18} color={colors.textPrimary} />
              </View>
              <View style={styles.headerTextGroup}>
                <Typography variant="bodyBold">
                  Expo SecureStore Encrypted
                </Typography>
                <Typography variant="caption" color={colors.textSecondary}>
                  API keys are stored strictly in hardware Keychain / Keystore
                  and never written to AsyncStorage or cloud backups.
                </Typography>
              </View>
            </View>
          </Card>
        </Animated.View>

        {__DEV__ ? <MotionDiagnosticsCard /> : null}

        {/* Section 6: About & Privacy Accordions */}
        <Animated.View entering={entering}>
          <Typography
            variant="caption"
            color={colors.textSecondary}
            style={styles.sectionHeader}
          >
            ABOUT & LEGAL
          </Typography>
          <Card variant="outline" style={styles.cardSection}>
            {/* About AETHER */}
            <AnimatedLayoutView>
              <AnimatedPressable
                onPress={() => {
                  setShowAbout((v) => !v);
                }}
                style={styles.accordionHeader}
              >
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: colors.surfaceRaised,
                      borderColor: colors.borderDefault,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Info size={18} color={colors.textPrimary} />
                </View>
                <Typography variant="bodyBold" style={{ flex: 1 }}>
                  About AETHER
                </Typography>
              </AnimatedPressable>
              {showAbout ? (
                <Animated.View
                  layout={settingsLayout}
                  style={styles.accordionBody}
                >
                  <Typography
                    variant="body"
                    color={colors.textSecondary}
                    style={styles.accordionText}
                  >
                    AETHER is a local-first, privacy-respecting task assistant.
                    OpenRouter powers reasoning and tool execution; OpenAI
                    powers realtime voice transcription.
                  </Typography>
                </Animated.View>
              ) : null}
            </AnimatedLayoutView>

            <View
              style={[
                styles.divider,
                {
                  backgroundColor: colors.borderDefault,
                },
              ]}
            />

            {/* Privacy Policy */}
            <AnimatedLayoutView>
              <AnimatedPressable
                onPress={() => {
                  setShowPrivacy((v) => !v);
                }}
                style={styles.accordionHeader}
              >
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: colors.surfaceRaised,
                      borderColor: colors.borderDefault,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Shield size={18} color={colors.textPrimary} />
                </View>
                <Typography variant="bodyBold" style={{ flex: 1 }}>
                  Privacy Information
                </Typography>
              </AnimatedPressable>
              {showPrivacy ? (
                <Animated.View
                  layout={settingsLayout}
                  style={styles.accordionBody}
                >
                  <Typography
                    variant="body"
                    color={colors.textSecondary}
                    style={styles.accordionText}
                  >
                    API keys remain isolated in SecureStore and are never
                    included in analytics, error logs, or AsyncStorage. Task
                    content is sent to OpenRouter only when requested. Voice
                    audio is streamed to OpenAI only during active transcription
                    sessions.
                  </Typography>
                </Animated.View>
              ) : null}
            </AnimatedLayoutView>
          </Card>

          {/* App Version Footer */}
          <Typography
            variant="tiny"
            align="center"
            color={colors.textTertiary}
            style={styles.versionFooter}
          >
            AETHER v1.0.0 • Expo SDK 57
          </Typography>
        </Animated.View>
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

function AnimatedLayoutView({ children }: { children: React.ReactNode }) {
  return <Animated.View layout={settingsLayout}>{children}</Animated.View>;
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
    marginBottom: Spacing.xxl,
  },
  headerTitle: {
    letterSpacing: -0.8,
  },
  headerDescription: {
    marginTop: Spacing.sm,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.45,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  cardSection: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextGroup: {
    flex: 1,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
  },
  inputWrapper: {
    position: "relative",
    justifyContent: "center",
    marginTop: Spacing.md,
  },
  textInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    paddingRight: 48,
    fontSize: 14,
  },
  eyeButton: {
    position: "absolute",
    right: 12,
    padding: 6,
  },
  storageNote: {
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
  buttonStack: {
    flexDirection: "column",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  statusMessage: {
    marginTop: Spacing.sm,
    fontWeight: "600",
  },
  activeModelCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  defaultBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  pullDownButton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginTop: Spacing.xs,
  },
  segmentedContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  segmentedItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: Radius.pill,
  },
  iconPressable: {
    padding: 6,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.md,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  accordionBody: {
    marginTop: Spacing.sm,
  },
  accordionText: {
    fontSize: 13,
    lineHeight: 20,
  },
  versionFooter: {
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
});
