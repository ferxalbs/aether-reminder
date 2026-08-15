import { Button } from "@/components/ui/Button";
import { SimpleMarkdown } from "@/components/ui/SimpleMarkdown";
import { Typography } from "@/components/ui/Typography";
import { useMotionPreset, useMotionProfile } from "@/motion";
import type { AgentSemanticState } from "@/services/agent";
import { Colors, Hairline, Radius, Spacing } from "@/theme/tokens";
import { useIsDark } from "@/theme/useResolvedTheme";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react-native";
import React, { useEffect, type RefObject } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { SharedValue } from "react-native-reanimated";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AssistantComposer } from "./AssistantComposer";
import { GlassSurface } from "../ui/GlassSurface";
import type {
  AssistantMessage,
  AssistantReceipt,
  AssistantSurfaceState,
  PendingAssistantConfirmation,
} from "./assistantTypes";
import type { VoiceState } from "./VoiceController";
import { isVoiceFailureState } from "./VoiceController";

interface AssistantSheetProps {
  surface: AssistantSurfaceState;
  messages: AssistantMessage[];
  receipts: AssistantReceipt[];
  semanticState: AgentSemanticState;
  error: string | null;
  canRetry: boolean;
  isRunning: boolean;
  pendingConfirmation: PendingAssistantConfirmation | null;
  composerValue: string;
  onComposerChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  onExpand: () => void;
  onConfirm: () => void;
  onCancelConfirmation: () => void;
  onRetry: () => void;
  reduceMotion: boolean;
  voiceState: VoiceState;
  voiceLocked: boolean;
  voiceError: string | null;
  voiceErrorTitle: string;
  voiceNeedsSystemSettings: boolean;
  voiceNeedsAppSettings: boolean;
  voiceCanRetry: boolean;
  voiceRetryAttempt: number;
  voiceTranscript: string;
  voiceAudioLevel: SharedValue<number>;
  onVoiceStop: () => void;
  onVoiceCancel: () => void;
  onVoiceRetry: () => void;
  onVoiceDismiss: () => void;
  onVoiceOpenAppSettings: () => void;
  onVoiceOpenSettings: () => void;
  keyboardOffset: number;
  blurTarget?: RefObject<View | null>;
  onVoicePress: () => void;
}

function assistantStateLabel(state: AgentSemanticState): string {
  switch (state) {
    case "contextualizing":
      return "Preparing context";
    case "thinking":
      return "Thinking";
    case "executing":
      return "Executing action";
    case "waiting_confirmation":
      return "Waiting for confirmation";
    case "responding":
      return "Responding";
    case "error":
      return "Needs attention";
    case "idle":
    default:
      return "Ready";
  }
}

function confirmationTitle(pending: PendingAssistantConfirmation): string {
  if (pending.action.toolId === "tasks.delete") {
    const args = pending.action.args as { ids?: unknown[]; id?: unknown };
    const count = Array.isArray(args.ids) ? args.ids.length : args.id ? 1 : 0;
    return count > 1 ? `Delete ${count} tasks?` : "Delete this task?";
  }
  if (pending.action.toolId === "app.navigate")
    return "Open another AETHER surface?";
  return "Confirm this action?";
}

function VoiceMeter({
  level,
  color,
}: {
  level: SharedValue<number>;
  color: string;
}) {
  const profile = useMotionProfile();
  const bars = profile.budget.allowComplexOrb
    ? [0.45, 0.7, 0.95, 1.2, 0.95, 0.7, 0.45]
    : [0.7, 1, 0.7];
  return (
    <View style={styles.voiceMeter} accessibilityElementsHidden>
      {bars.map((weight, index) => (
        <VoiceMeterBar
          key={index}
          level={level}
          weight={weight}
          color={color}
        />
      ))}
    </View>
  );
}

function VoiceMeterBar({
  level,
  weight,
  color,
}: {
  level: SharedValue<number>;
  weight: number;
  color: string;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleY: Math.max(0.2, Math.min(1, level.value * weight + 0.16)) },
    ],
    opacity: 0.46 + Math.min(1, level.value) * 0.54,
  }));
  return (
    <Animated.View
      style={[styles.voiceMeterBar, { backgroundColor: color }, animatedStyle]}
    />
  );
}

export const AssistantSheet: React.FC<AssistantSheetProps> = ({
  surface,
  messages,
  receipts,
  semanticState,
  error,
  canRetry,
  isRunning,
  pendingConfirmation,
  composerValue,
  onComposerChange,
  onSubmit,
  onClose,
  onExpand,
  onConfirm,
  onCancelConfirmation,
  onRetry,
  reduceMotion,
  voiceState,
  voiceLocked,
  voiceError,
  voiceErrorTitle,
  voiceNeedsSystemSettings,
  voiceNeedsAppSettings,
  voiceCanRetry,
  voiceRetryAttempt,
  voiceTranscript,
  voiceAudioLevel,
  onVoiceStop,
  onVoiceCancel,
  onVoiceRetry,
  onVoiceDismiss,
  onVoiceOpenAppSettings,
  onVoiceOpenSettings,
  keyboardOffset,
  blurTarget,
  onVoicePress,
}) => {
  const isDark = useIsDark();
  const sheetPreset = useMotionPreset("sheet.present");
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const height = useSharedValue(0);
  const keyboardShift = useSharedValue(0);
  const isVisible = surface !== "closed";
  const showHeader = surface !== "closing";
  const showConversation = surface === "medium" || surface === "full";
  const voiceActive = [
    "checking_permission",
    "connecting",
    "listening",
    "committing",
    "finalizing",
    "parsing",
  ].includes(voiceState);
  const voiceFailed = isVoiceFailureState(voiceState) && Boolean(voiceError);
  const baseTargetHeight =
    surface === "opening" || surface === "compact"
      ? voiceActive
        ? voiceTranscript
          ? 220
          : 175
        : voiceError
          ? 175
          : 128
      : surface === "medium"
        ? Math.min(windowWidth >= 760 ? 520 : 480, windowHeight * 0.62)
        : surface === "full"
          ? Math.min(windowWidth >= 760 ? 760 : 720, windowHeight * 0.86)
          : 0;

  const targetHeight = baseTargetHeight > 0 ? baseTargetHeight + Math.max(insets.bottom, 24) : 0;

  useEffect(() => {
    if (reduceMotion || sheetPreset.mode === "none") {
      height.value = withTiming(targetHeight, {
        duration: Math.max(sheetPreset.durationMs, 80),
      });
    } else if (sheetPreset.mode === "timing") {
      height.value = withTiming(targetHeight, {
        duration: sheetPreset.durationMs,
      });
    } else {
      height.value = withSpring(targetHeight, {
        damping: sheetPreset.damping,
        stiffness: sheetPreset.stiffness,
        mass: sheetPreset.mass,
      });
    }
  }, [height, reduceMotion, sheetPreset, targetHeight]);

  useEffect(() => {
    keyboardShift.value = withTiming(keyboardOffset, {
      duration: reduceMotion ? 100 : 180,
    });
  }, [keyboardOffset, keyboardShift, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ height: height.value }));
  const animatedBottomStyle = useAnimatedStyle(() => ({
    bottom: keyboardShift.value,
  }));
  if (!isVisible) return null;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        animatedBottomStyle,
        animatedStyle,
        {
          borderColor: isDark ? Colors.borderDark : Colors.borderLight,
        }
      ]}
      pointerEvents="box-none"
    >
      <GlassSurface
        pointerEvents="none"
        borderRadius={36}
        borderWidth={0}
        blurTarget={blurTarget}
        style={[StyleSheet.absoluteFill, { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}
      />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.keyboardView}>
          {showHeader ? (
            <View style={styles.header}>
              <View style={styles.headerTitle}>
                <View
                  style={[
                    styles.statusMark,
                    { backgroundColor: isDark ? Colors.white : Colors.black },
                  ]}
                />
                <View>
                  <Typography variant="bodyBold">
                    {voiceActive || voiceFailed ? "Voice reminder" : "AETHER"}
                  </Typography>
                  <Typography
                    variant="tiny"
                    color={
                      isDark
                        ? Colors.secondaryTextDark
                        : Colors.secondaryTextLight
                    }
                    accessibilityLiveRegion="polite"
                  >
                    {voiceFailed
                      ? voiceErrorTitle
                      : voiceActive
                        ? "Alternative to manual entry"
                        : assistantStateLabel(semanticState)}
                  </Typography>
                </View>
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  onPress={onExpand}
                  accessibilityRole="button"
                  accessibilityLabel={
                    surface === "full"
                      ? "Collapse assistant conversation"
                      : "Expand assistant conversation"
                  }
                  style={styles.headerButton}
                >
                  {surface === "full" ? (
                    <ChevronDown
                      size={19}
                      color={
                        isDark
                          ? Colors.secondaryTextDark
                          : Colors.secondaryTextLight
                      }
                      strokeWidth={2.2}
                    />
                  ) : (
                    <ChevronUp
                      size={19}
                      color={
                        isDark
                          ? Colors.secondaryTextDark
                          : Colors.secondaryTextLight
                      }
                      strokeWidth={2.2}
                    />
                  )}
                </Pressable>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close assistant"
                  style={styles.headerButton}
                >
                  <X
                    size={19}
                    color={
                      isDark
                        ? Colors.secondaryTextDark
                        : Colors.secondaryTextLight
                    }
                    strokeWidth={2.2}
                  />
                </Pressable>
              </View>
            </View>
          ) : null}

          {showConversation ? (
            <FlatList
              style={styles.conversation}
              contentContainerStyle={styles.conversationContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              data={messages}
              keyExtractor={(message) => message.id}
              renderItem={({ item: message }) => {
                if (
                  !message.text &&
                  !(isRunning && message.role === "assistant")
                )
                  return null;

                if (message.role === "assistant") {
                  return (
                    <View style={styles.assistantMessageBlock}>
                      <SimpleMarkdown content={message.text || " "} />
                    </View>
                  );
                }

                return (
                  <View style={styles.userMessageRow}>
                    <Typography
                      variant="body"
                      color={
                        isDark
                          ? Colors.secondaryTextDark
                          : Colors.secondaryTextLight
                      }
                    >
                      {message.text}
                    </Typography>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Typography
                  variant="body"
                  color={
                    isDark
                      ? Colors.secondaryTextDark
                      : Colors.secondaryTextLight
                  }
                  style={styles.welcome}
                >
                  Ask about your tasks, or tell me what to change.
                </Typography>
              }
              ListFooterComponent={
                <View style={styles.conversationFooter}>
                  {receipts.map(({ receipt, toolId }) => (
                    <View
                      key={receipt.id}
                      style={[
                        styles.receipt,
                        {
                          borderColor: isDark
                            ? Colors.borderDark
                            : Colors.borderLight,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.receiptIcon,
                          {
                            backgroundColor: isDark
                              ? Colors.surfaceRaisedDark
                              : Colors.surfaceRaisedLight,
                            borderColor: isDark
                              ? Colors.borderDark
                              : Colors.borderLight,
                          },
                        ]}
                      >
                        <Check
                          size={14}
                          color={isDark ? Colors.white : Colors.black}
                          strokeWidth={2.8}
                        />
                      </View>
                      <View style={styles.receiptCopy}>
                        <Typography variant="bodyBold">
                          {receipt.summary}
                        </Typography>
                        <Typography
                          variant="tiny"
                          color={
                            isDark
                              ? Colors.secondaryTextDark
                              : Colors.secondaryTextLight
                          }
                        >
                          {toolId}
                        </Typography>
                      </View>
                    </View>
                  ))}

                  {pendingConfirmation ? (
                    <View
                      style={[
                        styles.confirmation,
                        {
                          backgroundColor: isDark
                            ? Colors.surfaceRaisedDark
                            : Colors.surfaceRaisedLight,
                          borderColor: isDark
                            ? Colors.borderDark
                            : Colors.borderLight,
                        },
                      ]}
                    >
                      <Typography variant="bodyBold">
                        {confirmationTitle(pendingConfirmation)}
                      </Typography>
                      <Typography
                        variant="caption"
                        color={
                          isDark
                            ? Colors.secondaryTextDark
                            : Colors.secondaryTextLight
                        }
                        style={styles.confirmationReason}
                      >
                        {pendingConfirmation.reason}
                      </Typography>
                      <View style={styles.confirmationActions}>
                        <Button
                          label="Cancel"
                          variant="secondary"
                          pill
                          size="md"
                          onPress={onCancelConfirmation}
                          style={styles.confirmationButton}
                        />
                        <Button
                          label="Confirm"
                          variant="primary"
                          pill
                          size="md"
                          onPress={onConfirm}
                          loading={isRunning}
                          style={styles.confirmationButton}
                        />
                      </View>
                    </View>
                  ) : null}

                  {error ? (
                    <View
                      accessibilityLiveRegion="assertive"
                      style={styles.errorMessage}
                    >
                      <Text
                        style={[
                          styles.errorText,
                          { color: isDark ? Colors.white : Colors.black },
                        ]}
                      >
                        {error}
                      </Text>
                      {canRetry ? (
                        <Button
                          label="Retry"
                          variant="secondary"
                          pill
                          size="md"
                          onPress={onRetry}
                          loading={isRunning}
                          style={styles.retryButton}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              }
            />
          ) : null}

          <View style={styles.composerContainer}>
            {voiceActive ? (
              <View
                style={[
                  styles.voiceControls,
                  {
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.05)"
                      : "rgba(0, 0, 0, 0.04)",
                    borderColor: isDark
                      ? Colors.borderDark
                      : Colors.borderLight,
                    borderWidth: Hairline.width,
                  },
                ]}
              >
                <View style={styles.voiceStatusRow}>
                  <View style={styles.voiceStatusCopy}>
                    <Typography variant="bodyBold">
                      {voiceState === "checking_permission"
                        ? "Checking microphone…"
                        : voiceState === "connecting"
                          ? voiceRetryAttempt > 0
                            ? "Retrying connection…"
                            : "Connecting…"
                          : voiceState === "listening"
                            ? "Listening…"
                            : voiceState === "parsing"
                              ? "Understanding reminder…"
                              : "Finalizing…"}
                    </Typography>
                    <Typography
                      variant="caption"
                      color={
                        isDark
                          ? Colors.secondaryTextDark
                          : Colors.secondaryTextLight
                      }
                    >
                      Say the reminder, date, and time in one sentence.
                    </Typography>
                  </View>
                  <VoiceMeter
                    level={voiceAudioLevel}
                    color={isDark ? Colors.white : Colors.black}
                  />
                </View>
                {voiceTranscript ? (
                  <Typography
                    variant="caption"
                    color={
                      isDark
                        ? Colors.secondaryTextDark
                        : Colors.secondaryTextLight
                    }
                    numberOfLines={3}
                  >
                    {voiceTranscript}
                  </Typography>
                ) : null}
                {voiceLocked ||
                voiceState === "connecting" ||
                voiceState === "checking_permission" ? (
                  <View style={styles.voiceActions}>
                    <Button
                      label="Cancel"
                      variant="secondary"
                      pill
                      size="md"
                      onPress={onVoiceCancel}
                    />
                    {voiceState === "listening" ? (
                      <Button
                        label="Stop & Send"
                        variant="primary"
                        pill
                        size="md"
                        onPress={onVoiceStop}
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}
            {voiceError ? (
              <View
                accessibilityLiveRegion="assertive"
                style={styles.voiceError}
              >
                <View style={styles.voiceErrorHeader}>
                  <AlertCircle
                    size={17}
                    color={isDark ? Colors.white : Colors.black}
                    strokeWidth={2.2}
                  />
                  <Typography variant="bodyBold">{voiceErrorTitle}</Typography>
                </View>
                <Typography
                  variant="caption"
                  color={
                    isDark
                      ? Colors.secondaryTextDark
                      : Colors.secondaryTextLight
                  }
                  style={styles.errorText}
                >
                  {voiceError}
                </Typography>
                <View style={styles.voiceErrorActions}>
                  {voiceCanRetry ? (
                    <Button
                      label="Retry"
                      variant="primary"
                      pill
                      size="md"
                      onPress={onVoiceRetry}
                    />
                  ) : null}
                  {voiceNeedsSystemSettings ? (
                    <Button
                      label="Settings"
                      variant="secondary"
                      pill
                      size="md"
                      onPress={onVoiceOpenSettings}
                    />
                  ) : null}
                  {voiceNeedsAppSettings ? (
                    <Button
                      label="Settings"
                      variant="secondary"
                      pill
                      size="md"
                      onPress={onVoiceOpenAppSettings}
                    />
                  ) : null}
                  <Button
                    label="Dismiss"
                    variant="ghost"
                    pill
                    size="md"
                    onPress={onVoiceDismiss}
                  />
                </View>
              </View>
            ) : null}
            {!voiceActive && !voiceError ? (
              <AssistantComposer
                value={composerValue}
                onChangeText={onComposerChange}
                onSubmit={onSubmit}
                disabled={isRunning}
                autoFocus={surface === "compact" && !voiceFailed}
                voiceState={voiceState}
                onVoicePress={onVoicePress}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignSelf: "center",
    width: "100%",
    maxWidth: 720,
    zIndex: 20,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 24,
  },
  sheet: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statusMark: {
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
  },
  voiceStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  voiceStatusCopy: {
    flex: 1,
    gap: 2,
  },
  voiceMeter: {
    width: 54,
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  voiceMeterBar: {
    width: 3,
    height: 28,
    borderRadius: Radius.pill,
  },
  headerActions: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  headerButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  conversation: {
    flex: 1,
  },
  conversationContent: {
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  conversationFooter: {
    gap: Spacing.sm,
  },
  welcome: {
    paddingVertical: Spacing.xl,
  },
  userMessageRow: {
    alignItems: "flex-end",
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  assistantMessageBlock: {
    width: "100%",
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  receipt: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: Hairline.width,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  receiptIcon: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    borderWidth: Hairline.width,
    alignItems: "center",
    justifyContent: "center",
  },
  receiptCopy: {
    flex: 1,
    gap: 2,
  },
  confirmation: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
  },
  confirmationReason: {
    marginTop: Spacing.xs,
  },
  confirmationActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  confirmationButton: {
    flex: 1,
  },
  errorMessage: {
    paddingVertical: Spacing.xs,
  },
  retryButton: {
    alignSelf: "flex-start",
    marginTop: Spacing.xs,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
  },
  composerContainer: {
    paddingTop: Spacing.xs,
  },
  voiceControls: {
    borderRadius: Radius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  voiceActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  voiceError: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    gap: Spacing.sm,
  },
  voiceErrorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  voiceErrorActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
});
