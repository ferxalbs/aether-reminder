import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { ArrowUp } from 'lucide-react-native';
import { Colors, Hairline, Motion, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
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
          backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight,
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
        placeholder="Ask anything, or tap mic…"
        placeholderTextColor={isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight}
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
          scaleTo={Motion.iconPressScale}
          style={[
            styles.sendButton,
            { backgroundColor: isDark ? Colors.white : Colors.black },
            disabled && styles.disabled,
          ]}
        >
          <ArrowUp size={18} color={isDark ? Colors.black : Colors.white} strokeWidth={2.8} />
        </AnimatedPressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  composer: {
    minHeight: 52,
    maxHeight: 128,
    borderRadius: Radius.xl,
    borderWidth: Hairline.width,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.xs,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
    fontSize: 15,
    lineHeight: 21,
    paddingTop: 9,
    paddingBottom: 9,
    paddingHorizontal: Spacing.xs,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  disabled: {
    opacity: 0.5,
  },
});

