import React from 'react';
import { StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { Colors, Radius } from '@/theme/tokens';
import { useSettingsStore } from '@/stores/settings.store';
import * as Haptics from 'expo-haptics';

export interface IconButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  variant?: 'solid' | 'glass' | 'ghost';
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  hapticStyle?: Haptics.ImpactFeedbackStyle;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onPress,
  variant = 'glass',
  size = 44,
  disabled = false,
  style,
  hapticStyle = Haptics.ImpactFeedbackStyle.Light,
}) => {
  const theme = useSettingsStore((s) => s.theme);
  const isDark = theme === 'dark' || (theme === 'system' && true);

  const getContainerStyle = () => {
    switch (variant) {
      case 'solid':
        return {
          backgroundColor: isDark ? Colors.white : Colors.zinc950,
          borderColor: 'transparent',
        };
      case 'glass':
        return {
          backgroundColor: isDark ? Colors.zinc900 : Colors.zinc100,
          borderColor: isDark ? Colors.glassBorderDark : Colors.glassBorderLight,
          borderWidth: 1,
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
        };
    }
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      hapticStyle={hapticStyle}
      scaleTo={0.93}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: Radius.pill,
        },
        getContainerStyle(),
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});
