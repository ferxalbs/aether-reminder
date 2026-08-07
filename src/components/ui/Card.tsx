import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { useSettingsStore } from '@/stores/settings.store';

export interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: 'elevated' | 'glass' | 'outline';
  style?: StyleProp<ViewStyle>;
  padding?: number;
  borderRadius?: number;
}

export const Card: React.FC<CardProps> = ({
  children,
  onPress,
  variant = 'elevated',
  style,
  padding = Spacing.md,
  borderRadius = Radius.xl,
}) => {
  const theme = useSettingsStore((s) => s.theme);
  const isDark = theme === 'dark' || (theme === 'system' && true);

  const getVariantStyle = () => {
    switch (variant) {
      case 'elevated':
        return {
          backgroundColor: isDark ? Colors.zinc900 : Colors.white,
          borderColor: isDark ? Colors.zinc800 : Colors.zinc200,
          borderWidth: 1,
          boxShadow: isDark
            ? '0px 4px 12px rgba(0, 0, 0, 0.4)'
            : '0px 4px 12px rgba(0, 0, 0, 0.06)',
          elevation: 3,
        };
      case 'glass':
        return {
          backgroundColor: isDark ? Colors.glassDark : Colors.glassLight,
          borderColor: isDark ? Colors.glassBorderDark : Colors.glassBorderLight,
          borderWidth: 1,
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          borderColor: isDark ? Colors.zinc800 : Colors.zinc300,
          borderWidth: 1,
        };
    }
  };

  const containerStyles = [
    styles.base,
    getVariantStyle(),
    { borderRadius, padding },
    style,
  ];

  if (onPress) {
    return (
      <AnimatedPressable onPress={onPress} scaleTo={0.97} style={containerStyles}>
        {children}
      </AnimatedPressable>
    );
  }

  return <View style={containerStyles}>{children}</View>;
};

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
