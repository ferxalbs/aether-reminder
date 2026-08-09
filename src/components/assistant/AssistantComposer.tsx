import React, { useEffect, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { ArrowUp } from 'lucide-react-native';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { AssistantVoiceButton } from './AssistantVoiceButton';
import type { VoiceState } from './VoiceController';

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
  const isDark = useIsDark();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoFocus]);

  const hasText = value.trim().length > 0;
  const foreground = isDark ? Colors.textDark : Colors.textLight;

  return (
    <View
      style={[
        styles.composer,
        {
          backgroundColor: isDark ? Colors.surfaceRaisedDark : '#EEF2F8',
          borderColor: isDark ? Colors.borderDark : Colors.borderLight,
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
        placeholder="Ask anything…"
        placeholderTextColor={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}
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
        <Pressable
          onPress={onSubmit}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled }}
          style={({ pressed }) => [
            styles.sendButton,
            { backgroundColor: isDark ? Colors.surfaceRaisedLight : Colors.brandInk },
            pressed && styles.pressed,
            disabled && styles.disabled,
          ]}
        >
          <ArrowUp size={18} color={isDark ? Colors.brandInk : Colors.white} strokeWidth={2.8} />
        </Pressable>
      ) : null}
      {!hasText ? (
        <Typography variant="tiny" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} style={styles.hint}>
          Tap microphone to speak
        </Typography>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  composer: {
    minHeight: 54,
    maxHeight: 132,
    borderRadius: Radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: Spacing.md,
    paddingRight: Spacing.xs,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
    borderCurve: 'continuous',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 112,
    fontSize: 16,
    lineHeight: 22,
    paddingTop: 9,
    paddingBottom: 9,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    position: 'absolute',
    right: 52,
    bottom: 14,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
