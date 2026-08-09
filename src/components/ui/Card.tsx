import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { GlassSurface } from './GlassSurface';
import { Colors, Motion, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';

interface CardBaseProps {
  children: React.ReactNode;
  variant?: 'elevated' | 'glass' | 'outline';
  style?: StyleProp<ViewStyle>;
  padding?: number;
  borderRadius?: number;
  accessibilityHint?: string;
}

export type CardProps = CardBaseProps &
  (
    | { onPress?: undefined; accessibilityLabel?: string }
    | { onPress: () => void; accessibilityLabel: string }
  );

export const Card: React.FC<CardProps> = ({
  children,
  onPress,
  variant = 'elevated',
  style,
  padding = Spacing.md,
  borderRadius = Radius.xl,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const isDark = useIsDark();

  const getVariantStyle = () => {
    switch (variant) {
      case 'elevated':
        return {
          backgroundColor: isDark ? Colors.surfaceDark : Colors.surfaceLight,
          borderColor: isDark ? Colors.borderDark : Colors.borderLight,
          borderWidth: 1,
          boxShadow: isDark
            ? '0 10px 28px rgba(0, 0, 0, 0.26)'
            : '0 8px 24px rgba(20, 45, 78, 0.08)',
        };
      case 'glass':
        return {
          backgroundColor: 'transparent',
          borderColor: isDark ? Colors.borderDark : Colors.borderLight,
          borderWidth: 1,
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          borderColor: isDark ? Colors.borderDark : Colors.borderLight,
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
  const content = (
    <>
      {variant === 'glass' ? (
        <GlassSurface
          pointerEvents="none"
          borderRadius={borderRadius}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {children}
    </>
  );

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        android_ripple={{ color: isDark ? Colors.rippleDark : Colors.rippleLight }}
        scaleTo={Motion.cardPressScale}
        style={containerStyles}
      >
        {content}
      </AnimatedPressable>
    );
  }

  return <View style={containerStyles}>{content}</View>;
};

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
});
