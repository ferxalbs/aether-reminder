import React from 'react';
import { Platform, Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { Colors, Hairline, Radius, TouchTargets } from '@/theme/tokens';
import { useSemanticColors } from '@/theme/useSemanticColors';
import { useIsDark } from '@/theme/useResolvedTheme';

export interface AetherToolbarButtonProps {
  icon: LucideIcon;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  hasBackground?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const AetherToolbarButton: React.FC<AetherToolbarButtonProps> = ({
  icon: Icon,
  onPress,
  accessibilityLabel,
  disabled = false,
  hasBackground = false,
  style,
}) => {
  const colors = useSemanticColors();
  const isDark = useIsDark();
  const touchSize = Platform.OS === 'android' ? TouchTargets.android : TouchTargets.ios;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.button,
        { width: touchSize, height: touchSize },
        hasBackground && {
          backgroundColor: isDark ? Colors.glassDarkFallback : Colors.glassLightFallback,
          borderRadius: Radius.pill,
          borderWidth: Hairline.width,
          borderColor: isDark ? Colors.borderDark : Colors.borderLight,
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Icon size={20} color={colors.textPrimary} strokeWidth={1.9} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.94 }],
  },
  disabled: {
    opacity: 0.4,
  },
});
