import React from 'react';
import { StyleSheet, ActivityIndicator, View, StyleProp, ViewStyle } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { Typography } from './Typography';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'glass' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
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
}) => {
  const isDark = useIsDark();

  const getContainerStyle = () => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: isDark ? Colors.white : Colors.zinc950,
          borderColor: 'transparent',
        };
      case 'secondary':
        return {
          backgroundColor: isDark ? Colors.zinc800 : Colors.zinc200,
          borderColor: isDark ? Colors.zinc700 : Colors.zinc300,
        };
      case 'glass':
        return {
          backgroundColor: isDark ? Colors.glassDark : Colors.glassLight,
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

  const getTextColor = () => {
    if (disabled) return Colors.zinc500;
    if (variant === 'primary') return isDark ? Colors.black : Colors.white;
    if (variant === 'ghost') return isDark ? Colors.zinc300 : Colors.zinc700;
    return isDark ? Colors.white : Colors.zinc950;
  };

  const getSizeStyle = () => {
    switch (size) {
      case 'sm':
        return { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.md };
      case 'lg':
        return { paddingVertical: 16, paddingHorizontal: 24, borderRadius: Radius.xl };
      case 'md':
      default:
        return { paddingVertical: 12, paddingHorizontal: 18, borderRadius: Radius.lg };
    }
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled || loading}
      scaleTo={0.96}
      style={[
        styles.base,
        getSizeStyle(),
        getContainerStyle(),
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <View style={styles.contentRow}>
          {icon && <View style={styles.iconMargin}>{icon}</View>}
          <Typography
            variant={size === 'sm' ? 'caption' : 'bodyBold'}
            color={getTextColor()}
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
    borderWidth: 1,
    borderColor: 'transparent',
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
    marginRight: Spacing.sm,
  },
  disabled: {
    opacity: 0.5,
  },
});
