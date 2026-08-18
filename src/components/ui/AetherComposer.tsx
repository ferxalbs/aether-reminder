import React, { useState } from "react";
import { Keyboard, Platform, StyleSheet, TextInput, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useReducedMotion,
} from "react-native-reanimated";
import { ArrowUp, Plus } from "lucide-react-native";
import { GlassSurface } from "./GlassSurface";
import {
  AnimatedPressable,
  getMinimumTouchTargetHitSlop,
} from "./AnimatedPressable";
import { LayoutTokens, Motion, Spacing } from "@/theme/tokens";
import { useAetherTheme } from "@/theme/useAetherTheme";

export interface AetherComposerProps {
  value?: string;
  onChangeText?: (text: string) => void;
  onSubmit?: (text: string) => void;
  onVoicePress?: () => void;
  onAddDate?: () => void;
  onSetPriority?: () => void;
  onAddLocation?: () => void;
  onAttachFile?: () => void;
  disabled?: boolean;
}

export const AetherComposer: React.FC<AetherComposerProps> = ({
  value: externalValue,
  onChangeText: externalOnChangeText,
  onSubmit,
  onAddDate,
  disabled = false,
}) => {
  const [internalValue, setInternalValue] = useState("");
  const theme = useAetherTheme();
  const { colors } = theme;
  const composerTokens = theme.components.composer;
  const reduceMotion = useReducedMotion();

  const textValue = externalValue !== undefined ? externalValue : internalValue;
  const setTextValue = (text: string) => {
    if (externalOnChangeText) externalOnChangeText(text);
    else setInternalValue(text);
  };

  const handleSubmit = () => {
    const trimmed = textValue.trim();
    if (!trimmed) return;
    if (onSubmit) onSubmit(trimmed);
    setTextValue("");
    Keyboard.dismiss();
  };

  const hasText = textValue.trim().length > 0;

  return (
    <View style={styles.host} pointerEvents="box-none">
      <GlassSurface
        borderRadius={theme.shape.pill}
        intensity={Platform.OS === "ios" ? 65 : 45}
        tier={Platform.OS === "android" ? "A" : undefined}
        style={styles.glassContainer}
        contentStyle={styles.content}
      >
        {/* Plus quick actions button */}
        <AnimatedPressable
          onPress={onAddDate}
          accessibilityRole="button"
          accessibilityLabel="Open editor"
          android_ripple={{ color: colors.ripple, foreground: true }}
          hitSlop={getMinimumTouchTargetHitSlop(44, 44, Platform.OS)}
          interactionRadius={theme.shape.pill}
          minimumTouchTarget={false}
          scaleTo={Motion.iconPressScale}
          style={[styles.iconButton, { borderRadius: theme.shape.pill }]}
        >
          <Plus size={20} color={composerTokens.icon} strokeWidth={2.2} />
        </AnimatedPressable>

        {/* Text Input */}
        <TextInput
          value={textValue}
          onChangeText={setTextValue}
          placeholder="New reminder…"
          placeholderTextColor={composerTokens.placeholder}
          editable={!disabled}
          returnKeyType="send"
          onSubmitEditing={handleSubmit}
          autoCapitalize="sentences"
          autoCorrect
          accessibilityLabel="New reminder"
          style={[styles.input, { color: composerTokens.icon }]}
        />

        {/* Send Action (only visible when text is present) */}
        {hasText ? (
          <Animated.View
            entering={reduceMotion ? undefined : FadeIn.duration(150)}
            exiting={reduceMotion ? undefined : FadeOut.duration(100)}
          >
            <AnimatedPressable
              onPress={handleSubmit}
              accessibilityRole="button"
              accessibilityLabel="Create reminder"
              android_ripple={{ color: colors.ripple, foreground: true }}
              hitSlop={getMinimumTouchTargetHitSlop(36, 36, Platform.OS)}
              interactionRadius={theme.shape.pill}
              minimumTouchTarget={false}
              scaleTo={Motion.iconPressScale}
              style={[
                styles.sendButton,
                { borderRadius: theme.shape.pill },
                { backgroundColor: composerTokens.actionBackground },
              ]}
            >
              <ArrowUp
                size={18}
                color={composerTokens.actionForeground}
                strokeWidth={2.8}
              />
            </AnimatedPressable>
          </Animated.View>
        ) : null}
      </GlassSurface>
    </View>
  );
};

const styles = StyleSheet.create({
  host: {
    width: "100%",
    maxWidth: LayoutTokens.navigationMaxWidth,
    alignSelf: "center",
  },
  glassContainer: {
    width: "100%",
    height: LayoutTokens.composerHeight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  content: {
    flex: 1,
    height: LayoutTokens.composerHeight,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xs,
    gap: Spacing.xs,
  },
  input: {
    flex: 1,
    height: 44,
    fontSize: 17,
    letterSpacing: -0.4,
    paddingVertical: Platform.OS === "android" ? 0 : undefined,
    paddingHorizontal: Spacing.sm,
    textAlignVertical: "center",
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
});
