import React from 'react';
import { Platform, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { GlassSurface } from './GlassSurface';
import { Colors, getMinimumTouchTarget, Motion, Radius } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import * as Haptics from 'expo-haptics';

export interface IconButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  variant?: 'solid' | 'glass' | 'ghost';
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  hapticStyle?: Haptics.ImpactFeedbackStyle | null;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  variant = 'glass',
  size = 44,
  disabled = false,
  style,
  hapticStyle = Haptics.ImpactFeedbackStyle.Light,
}) => {
  const isDark = useIsDark();
  const touchTarget = Math.max(size, getMinimumTouchTarget(Platform.OS));

  const getContainerStyle = () => {
    switch (variant) {
      case 'solid':
        return {
          backgroundColor: isDark ? Colors.surfaceRaisedLight : Colors.brandInk,
          borderColor: 'transparent',
        };
      case 'glass':
        return {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderWidth: 0,
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
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      android_ripple={{ color: isDark ? Colors.rippleDark : Colors.rippleLight }}
      hapticStyle={hapticStyle}
      scaleTo={Motion.iconPressScale}
      style={[
        styles.base,
        {
          width: touchTarget,
          height: touchTarget,
          borderRadius: Radius.pill,
        },
        getContainerStyle(),
        disabled && styles.disabled,
        style,
      ]}
    >
      {variant === 'glass' ? (
        <GlassSurface
          pointerEvents="none"
          borderRadius={Radius.pill}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {icon}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  disabled: {
    opacity: 0.4,
  },
});
