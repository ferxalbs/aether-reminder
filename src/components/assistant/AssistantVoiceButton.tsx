import React from 'react';
import { AlertCircle, Mic, Square } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import type { VoiceState } from './VoiceController';

interface AssistantVoiceButtonProps {
  voiceState: VoiceState;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * A direct voice affordance for the assistant composer.
 *
 * This control keeps the primary action explicit, labeled by its
 * accessibility state, and only animates while the user presses it.
 */
export const AssistantVoiceButton: React.FC<AssistantVoiceButtonProps> = ({
  voiceState,
  disabled = false,
  onPress,
}) => {
  const isDark = useIsDark();
  const isError = voiceState === 'error';
  const isActive = voiceState !== 'idle' && !isError;
  const Icon = isError ? AlertCircle : isActive ? Square : Mic;
  const iconColor = isError
    ? isDark
      ? Colors.destructiveTextDark
      : Colors.destructiveTextLight
    : isDark
      ? Colors.white
      : Colors.black;

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.92}
      accessibilityRole="button"
      accessibilityLabel={isError ? 'Retry voice input' : isActive ? 'Voice input in progress' : 'Start voice input'}
      accessibilityHint={isActive ? 'Use the voice controls to cancel or send' : 'Speak naturally to create a reminder'}
      accessibilityState={{ disabled, busy: isActive }}
      style={[
        styles.button,
        {
          backgroundColor: isError
            ? isDark
              ? Colors.destructiveBackgroundDark
              : Colors.destructiveBackgroundLight
            : isDark
              ? 'rgba(255, 255, 255, 0.12)'
              : 'rgba(0, 0, 0, 0.10)',
          borderColor: isError
            ? isDark
              ? Colors.destructiveBorderDark
              : Colors.destructiveBorderLight
            : isDark
              ? 'rgba(255, 255, 255, 0.22)'
              : 'rgba(0, 0, 0, 0.18)',
        },
        disabled && styles.disabled,
      ]}
    >
      <Icon size={18} color={iconColor} strokeWidth={2.2} />
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderCurve: 'continuous',
    marginBottom: Spacing.xs,
  },
  disabled: {
    opacity: 0.5,
  },
});
