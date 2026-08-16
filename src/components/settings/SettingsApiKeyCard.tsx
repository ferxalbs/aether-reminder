import React, { useCallback, useState } from "react";
import { Platform, StyleSheet, TextInput, View } from "react-native";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { Button } from "@/components/ui/Button";
import { Typography } from "@/components/ui/Typography";
import { notificationAsync } from "@/lib/haptics";
import { reportNonFatalError } from "@/lib/nonFatalError";
import { testOpenRouterConnection } from "@/services/ai/openrouter";
import { getAIErrorMessage } from "@/services/ai/providers";
import { testOpenAIRealtimeConnection } from "@/services/transcription";
import { useSettingsStore } from "@/stores/settings.store";
import { Hairline, Radius, Spacing } from "@/theme/tokens";
import { useAetherTheme } from "@/theme/useAetherTheme";
import * as Haptics from "expo-haptics";
import {
  Eye,
  EyeOff,
  Key,
  Mic,
  Shield,
  ShieldCheck,
  Trash2,
} from "lucide-react-native";
import { SettingsCard } from "./SettingsCard";
import { SettingsHeaderRow } from "./SettingsHeaderRow";
import type { AetherAlertDialogState } from "@/components/ui/AetherAlertDialog";

export type ApiKeyProvider = "OpenRouter" | "OpenAI";

export interface SettingsApiKeyCardProps {
  provider: ApiKeyProvider;
  onShowAlert: (dialog: AetherAlertDialogState) => void;
}

export const SettingsApiKeyCard: React.FC<SettingsApiKeyCardProps> = React.memo(
  ({ provider, onShowAlert }) => {
    const { colors } = useAetherTheme();

    const isRouter = provider === "OpenRouter";
    const apiKey = useSettingsStore((s) =>
      isRouter ? s.openRouterApiKey : s.openAiApiKey,
    );
    const keyLoaded = useSettingsStore((s) =>
      isRouter ? s.openRouterKeyLoaded : s.openAiKeyLoaded,
    );
    const configured = useSettingsStore((s) =>
      isRouter ? s.openRouterConfigured : s.openAiConfigured,
    );
    const secureStoreAvailable = useSettingsStore(
      (s) => s.secureStoreAvailable,
    );
    const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

    const setApiKey = useSettingsStore((s) =>
      isRouter ? s.setOpenRouterApiKey : s.setOpenAiApiKey,
    );
    const deleteApiKey = useSettingsStore((s) =>
      isRouter ? s.deleteOpenRouterApiKey : s.deleteOpenAiApiKey,
    );

    const [input, setInput] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    const title = isRouter ? "OpenRouter API Key" : "OpenAI API Key";
    const subtitle = isRouter
      ? "Powers AETHER’s tool reasoning and agent actions."
      : "Used strictly for realtime voice transcription.";
    const placeholder = configured
      ? "••••••••••••••••••••••••"
      : `Enter ${provider} API Key`;

    const handleSaveKey = useCallback(async () => {
      if (!input.trim()) {
        onShowAlert({
          title: "API Key Required",
          message: `Enter an ${provider} API key before saving.`,
          actions: [{ label: "OK" }],
        });
        return;
      }
      setIsSaving(true);
      try {
        await setApiKey(input);
        setInput("");
        setShowKey(false);
        setStatusMessage(`${provider} key saved securely in SecureStore.`);
        if (hapticsEnabled) {
          notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            (error: unknown) => {
              reportNonFatalError("haptics", error);
            },
          );
        }
      } catch (error) {
        onShowAlert({
          title: `${provider} Key Not Saved`,
          message: getAIErrorMessage(error),
          actions: [{ label: "OK" }],
        });
      } finally {
        setIsSaving(false);
      }
    }, [input, provider, setApiKey, onShowAlert, hapticsEnabled]);

    const handleTestConnection = useCallback(async () => {
      const keyToTest = input.trim() || apiKey;
      if (!keyToTest) {
        onShowAlert({
          title: "API Key Required",
          message: `Save an ${provider} key or enter one to test.`,
          actions: [{ label: "OK" }],
        });
        return;
      }
      setIsTesting(true);
      try {
        const result = isRouter
          ? await testOpenRouterConnection(keyToTest)
          : await testOpenAIRealtimeConnection(keyToTest);
        setStatusMessage(`✓ ${result.provider} API connection verified.`);
        if (hapticsEnabled) {
          notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            (error: unknown) => {
              reportNonFatalError("haptics", error);
            },
          );
        }
      } catch (error) {
        setStatusMessage(`✕ ${getAIErrorMessage(error)}`);
      } finally {
        setIsTesting(false);
      }
    }, [input, apiKey, provider, isRouter, onShowAlert, hapticsEnabled]);

    const handleDeleteKey = useCallback(() => {
      if (!configured) {
        setInput("");
        return;
      }
      onShowAlert({
        title: `Delete ${provider} API Key?`,
        message: isRouter
          ? "This disables AI reasoning and automated task actions until another OpenRouter key is saved."
          : "This disables realtime voice transcription until another OpenAI key is saved.",
        actions: [
          { label: "Cancel", role: "cancel" },
          {
            label: "Delete Key",
            role: "destructive",
            onPress: () => {
              void deleteApiKey()
                .then(() => {
                  setInput("");
                  setStatusMessage(`${provider} key deleted from SecureStore.`);
                  if (hapticsEnabled) {
                    notificationAsync(
                      Haptics.NotificationFeedbackType.Warning,
                    ).catch((error: unknown) => {
                      reportNonFatalError("haptics", error);
                    });
                  }
                })
                .catch((error: unknown) => {
                  onShowAlert({
                    title: `${provider} Key Not Deleted`,
                    message: getAIErrorMessage(error),
                    actions: [{ label: "OK" }],
                  });
                });
            },
          },
        ],
      });
    }, [
      configured,
      provider,
      isRouter,
      deleteApiKey,
      onShowAlert,
      hapticsEnabled,
    ]);

    const storageDescription = !keyLoaded
      ? "Checking secure hardware storage…"
      : secureStoreAvailable
        ? "Keys are encrypted locally in Expo SecureStore. Only non-secret preferences use local storage."
        : "Secure storage is unavailable in this environment.";

    return (
      <SettingsCard>
        <SettingsHeaderRow
          icon={
            isRouter ? (
              <Key size={20} color={colors.accent} />
            ) : (
              <Mic size={20} color={colors.accent} />
            )
          }
          title={title}
          subtitle={subtitle}
        />

        {/* Key Status Banner */}
        <View
          style={[
            styles.statusBanner,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.borderDefault,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Typography
              variant="tiny"
              color={configured ? colors.textPrimary : colors.textSecondary}
              style={{ letterSpacing: 0.5 }}
            >
              KEY STATUS
            </Typography>
            <Typography
              variant="bodyBold"
              style={{ color: colors.textPrimary, marginTop: 2 }}
            >
              {keyLoaded
                ? configured
                  ? "Saved in SecureStore"
                  : "No key configured"
                : "Checking SecureStore…"}
            </Typography>
          </View>
          {configured ? (
            <ShieldCheck size={20} color={colors.accent} />
          ) : (
            <Shield size={20} color={colors.textTertiary} />
          )}
        </View>

        {/* Input Field */}
        <View style={styles.inputWrapper}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={placeholder}
            placeholderTextColor={colors.textTertiary}
            secureTextEntry={!showKey}
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
            onPress={() => setShowKey((v) => !v)}
            style={styles.eyeButton}
            scaleTo={0.9}
            interactionRadius={Radius.pill}
            accessibilityRole="button"
            accessibilityLabel={showKey ? "Hide key" : "Show key"}
          >
            {showKey ? (
              <EyeOff size={18} color={colors.textSecondary} />
            ) : (
              <Eye size={18} color={colors.textSecondary} />
            )}
          </AnimatedPressable>
        </View>

        {/* Storage Integrity Description */}
        <Typography
          variant="caption"
          color={colors.textTertiary}
          style={styles.storageNote}
        >
          {storageDescription}
        </Typography>

        {/* Action Buttons */}
        <View style={styles.buttonStack}>
          <Button
            label="Save Key"
            onPress={() => void handleSaveKey()}
            variant={configured ? "secondary" : "primary"}
            loading={isSaving}
            disabled={
              !secureStoreAvailable || !keyLoaded || isTesting || !input.trim()
            }
            fullWidth
          />
          <Button
            label="Test Connection"
            onPress={() => void handleTestConnection()}
            variant="secondary"
            loading={isTesting}
            disabled={!keyLoaded || isSaving}
            fullWidth
          />
          {configured || input.trim() ? (
            <Button
              label="Delete Key"
              onPress={handleDeleteKey}
              variant="destructive"
              icon={<Trash2 size={16} color={colors.destructive} />}
              disabled={!keyLoaded || isSaving || isTesting}
              fullWidth
            />
          ) : null}
        </View>

        {statusMessage ? (
          <Typography
            variant="caption"
            color={colors.textPrimary}
            style={styles.statusMessage}
          >
            {statusMessage}
          </Typography>
        ) : null}
      </SettingsCard>
    );
  },
);

SettingsApiKeyCard.displayName = "SettingsApiKeyCard";

const styles = StyleSheet.create({
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: Hairline.width,
    marginTop: Spacing.md,
  },
  inputWrapper: {
    position: "relative",
    justifyContent: "center",
    marginTop: Spacing.md,
  },
  textInput: {
    borderRadius: Radius.lg,
    borderWidth: Hairline.width,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === "ios" ? 13 : 10,
    paddingRight: 48,
    fontSize: 14,
  },
  eyeButton: {
    position: "absolute",
    right: 12,
    padding: 8,
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
});
