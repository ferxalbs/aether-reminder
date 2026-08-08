import React, { useEffect, useRef } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { ArrowUp, Mic } from 'lucide-react-native';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';

interface AssistantComposerProps {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export const AssistantComposer: React.FC<AssistantComposerProps> = ({
  value,
  onChangeText,
  onSubmit,
  disabled = false,
  autoFocus = false,
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
  const foreground = isDark ? Colors.white : Colors.zinc950;

  return (
    <View
      style={[
        styles.composer,
        {
          backgroundColor: isDark ? Colors.zinc800 : Colors.zinc100,
          borderColor: isDark ? Colors.zinc700 : Colors.zinc200,
        },
      ]}
    >
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder="Ask AETHER…"
        placeholderTextColor={Colors.zinc500}
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voice capture"
        accessibilityHint="Voice capture will be available in Slice 5"
        accessibilityState={{ disabled: true }}
        disabled
        style={styles.iconButton}
      >
        <Mic size={19} color={Colors.zinc500} />
      </Pressable>
      {hasText ? (
        <Pressable
          onPress={onSubmit}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled }}
          style={({ pressed }) => [
            styles.sendButton,
            { backgroundColor: isDark ? Colors.white : Colors.black },
            pressed && styles.pressed,
            disabled && styles.disabled,
          ]}
        >
          <ArrowUp size={18} color={isDark ? Colors.black : Colors.white} strokeWidth={2.8} />
        </Pressable>
      ) : null}
      {!hasText ? (
        <Typography variant="tiny" color={Colors.zinc500} style={styles.hint}>
          {Platform.OS === 'ios' ? 'Return to send' : 'Ready'}
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
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
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
