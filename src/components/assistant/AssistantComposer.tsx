import React, { useEffect, useRef } from "react";
import { Platform, StyleSheet, TextInput, View } from "react-native";
import { ArrowUp } from "lucide-react-native";
import { Hairline, Motion, Radius, Spacing } from "@/theme/tokens";
import { useAetherTheme } from "@/theme/useAetherTheme";
import {
  AnimatedPressable,
  getMinimumTouchTargetHitSlop,
} from "@/components/ui/AnimatedPressable";
import { AssistantVoiceButton } from "./AssistantVoiceButton";
import type { VoiceState } from "./VoiceController";

interface AssistantComposerProps {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  voiceState: VoiceState;
  onVoicePress: () => void;
}

export const AssistantComposer: React.FC<AssistantComposerProps> = ({
  value,
  onChangeText,
  onSubmit,
  disabled = false,
  autoFocus = false,
  voiceState,
  onVoicePress,
}) => {
  const theme = useAetherTheme();
  const { colors } = theme;
  const fieldTokens = theme.components.field;
  const composerTokens = theme.components.composer;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoFocus]);

  const hasText = value.trim().length > 0;
  const foreground = fieldTokens.text;

  return (
    <View
      style={[
        styles.composer,
        {
          backgroundColor: fieldTokens.background,
          borderColor: fieldTokens.border,
        },
      ]}
    >
      <AssistantVoiceButton
        voiceState={voiceState}
        disabled={disabled}
        onPress={onVoicePress}
      />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder="Ask anything, or tap mic…"
        placeholderTextColor={fieldTokens.placeholder}
        multiline
        maxLength={2000}
        editable={!disabled}
        returnKeyType="send"
        blurOnSubmit={false}
        onSubmitEditing={() => {
          if (hasText) onSubmit();
        }}
        autoCapitalize="sentences"
        autoCorrect
        accessibilityLabel="Ask AETHER"
        style={[styles.input, { color: foreground }]}
      />
      {hasText ? (
        <AnimatedPressable
          onPress={onSubmit}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled }}
          android_ripple={{
            color: colors.ripple,
            foreground: true,
          }}
          hitSlop={getMinimumTouchTargetHitSlop(38, 38, Platform.OS)}
          interactionRadius={Radius.pill}
          minimumTouchTarget={false}
          scaleTo={Motion.iconPressScale}
          style={[
            styles.sendButton,
            { backgroundColor: composerTokens.actionBackground },
            disabled && styles.disabled,
          ]}
        >
          <ArrowUp
            size={18}
            color={composerTokens.actionForeground}
            strokeWidth={2.8}
          />
        </AnimatedPressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  composer: {
    minHeight: 52,
    maxHeight: 128,
    borderRadius: 26,
    borderWidth: Hairline.width,
    flexDirection: "row",
    alignItems: "flex-end",
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.xs,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.4,
    paddingTop: Platform.OS === "ios" ? 11 : 0,
    paddingBottom: Platform.OS === "ios" ? 11 : 0,
    paddingHorizontal: Spacing.xs,
    textAlignVertical: "center",
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
  },
  disabled: {
    opacity: 0.5,
  },
});
