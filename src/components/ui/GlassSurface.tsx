import React, { type RefObject } from 'react';
import { Platform, StyleSheet, View, ViewProps, ViewStyle, StyleProp } from 'react-native';
import { BlurView, type BlurViewProps } from 'expo-blur';
import { Colors, Hairline, Radius } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';

export type GlassTier = 'A' | 'B' | 'C';

export interface GlassSurfaceProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: BlurViewProps['tint'];
  borderRadius?: number;
  borderWidth?: number;
  tier?: GlassTier;
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: ViewProps['accessibilityRole'];
  pointerEvents?: ViewProps['pointerEvents'];
  blurTarget?: RefObject<View | null>;
}

export const GlassSurface: React.FC<GlassSurfaceProps> = ({
  children,
  style,
  contentStyle,
  intensity = 45,
  tint,
  borderRadius = Radius.xl,
  borderWidth = Hairline.width,
  tier = 'A',
  accessible,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  pointerEvents,
  blurTarget,
}) => {
  const isDark = useIsDark();
  const borderColor = isDark ? Colors.borderDark : Colors.borderLight;
  const fallbackBg = isDark ? Colors.glassDarkFallback : Colors.glassLightFallback;
  const glassBg = isDark ? Colors.glassDark : Colors.glassLight;
  const resolvedTint = tint ?? (isDark ? 'dark' : 'light');

  // Android's native blur requires a BlurTargetView outside the BlurView's own
  // hierarchy. Route-local surfaces intentionally fall back rather than target
  // an ancestor that contains them, which Dimezis BlurView explicitly forbids.
  if (tier === 'C' || (Platform.OS === 'android' && !blurTarget)) {
    return (
      <View
        style={[
          styles.container,
          {
            borderRadius,
            borderWidth,
            borderColor,
            backgroundColor: fallbackBg,
          },
          style,
        ]}
        accessible={accessible}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityRole={accessibilityRole}
        pointerEvents={pointerEvents}
      >
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    );
  }

  // Tier A / B BlurView
  const blurIntensity = tier === 'B' ? Math.max(15, Math.round(intensity * 0.5)) : intensity;

  return (
    <View
      style={[
        styles.container,
        {
          borderRadius,
          borderWidth,
          borderColor,
          backgroundColor: glassBg,
        },
        style,
      ]}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
      pointerEvents={pointerEvents}
    >
      <BlurView
        intensity={blurIntensity}
        tint={resolvedTint}
        blurTarget={blurTarget}
        blurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
