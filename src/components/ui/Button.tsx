import React from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { GlassSurface } from './GlassSurface';
import { Typography } from './Typography';
import { Colors, getMinimumTouchTarget, Motion, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'glass' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const isDark = useIsDark();
  const isDisabled = disabled || loading;

  const getContainerStyle = () => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: isDark ? Colors.white : Colors.black,
          borderColor: 'transparent',
        };
      case 'secondary':
        return {
          backgroundColor: isDark ? Colors.white : Colors.black,
          borderColor: isDark ? Colors.white : Colors.black,
        };
      case 'glass':
        return {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderWidth: 0,
        };
      case 'destructive':
        return {
          backgroundColor: isDark
            ? Colors.destructiveBackgroundDark
            : Colors.destructiveBackgroundLight,
          borderColor: isDark
            ? Colors.destructiveBorderDark
            : Colors.destructiveBorderLight,
        };
      case 'ghost':
      default:
        return {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
        };
    }
  };

  const getTextColor = () => {
    if (isDisabled) return Colors.zinc500;
    if (variant === 'primary') return isDark ? Colors.black : Colors.white;
    if (variant === 'destructive') {
      return isDark ? Colors.destructiveTextDark : Colors.destructiveTextLight;
    }
    if (variant === 'ghost') return isDark ? Colors.zinc300 : Colors.zinc700;
    return isDark ? Colors.white : Colors.zinc950;
  };

  const getSizeStyle = () => {
    switch (size) {
      case 'sm':
        return {
          minHeight: getMinimumTouchTarget(Platform.OS),
          paddingVertical: 8,
          paddingHorizontal: 16,
          borderRadius: Radius.md,
        };
      case 'lg':
        return {
          minHeight: getMinimumTouchTarget(Platform.OS),
          paddingVertical: 16,
          paddingHorizontal: 26,
          borderRadius: Radius.lg,
        };
      case 'md':
      default:
        return {
          minHeight: getMinimumTouchTarget(Platform.OS),
          paddingVertical: 12,
          paddingHorizontal: 20,
          borderRadius: Radius.md,
        };
    }
  };

  const sizeStyle = getSizeStyle();

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      android_ripple={{ color: isDark ? Colors.rippleDark : Colors.rippleLight }}
      scaleTo={Motion.buttonPressScale}
      style={[
        styles.base,
        sizeStyle,
        getContainerStyle(),
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {variant === 'glass' ? (
        <GlassSurface
          pointerEvents="none"
          borderRadius={sizeStyle.borderRadius}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <View style={styles.contentRow}>
          {icon && <View style={styles.iconMargin}>{icon}</View>}
          <Typography
            variant={size === 'sm' ? 'caption' : 'bodyBold'}
            color={getTextColor()}
            style={{ fontWeight: '600' }}
          >
            {label}
          </Typography>
        </View>
      )}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
    borderCurve: 'continuous',
  },
  fullWidth: {
    width: '100%',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconMargin: {
    marginRight: Spacing.xs,
  },
  disabled: {
    opacity: 0.45,
  },
});
