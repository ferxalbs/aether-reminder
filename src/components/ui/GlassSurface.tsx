import React from 'react';
import { Platform, StyleSheet, View, ViewProps, ViewStyle, StyleProp } from 'react-native';
import { BlurView, BlurViewProps } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Colors, Radius } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';

export interface GlassSurfaceProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: BlurViewProps['tint'];
  borderRadius?: number;
  borderWidth?: number;
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: ViewProps['accessibilityRole'];
  pointerEvents?: ViewProps['pointerEvents'];
}

export const GlassSurface: React.FC<GlassSurfaceProps> = ({
  children,
  style,
  contentStyle,
  intensity = 60,
  tint,
  borderRadius = Radius.lg,
  borderWidth = 1,
  accessible,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  pointerEvents,
}) => {
  const isDark = useIsDark();
  const isIOS = Platform.OS === 'ios';
  const isAndroid = Platform.OS === 'android';

  const activeTint = tint || (isDark ? 'dark' : 'light');
  const borderColor = isDark ? Colors.glassBorderDark : Colors.glassBorderLight;
  const backgroundColor = isAndroid
    ? isDark
      ? Colors.zinc900
      : Colors.white
    : isDark
      ? Colors.glassDark
      : Colors.glassLight;

  const useLiquidGlass =
    isIOS && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  const useBlurView = isIOS;

  return (
    <View
      style={[
        styles.container,
        {
          borderRadius,
          borderWidth,
          borderColor,
          backgroundColor,
        },
        style,
      ]}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
      pointerEvents={pointerEvents}
    >
      {useLiquidGlass ? (
        <GlassView
          style={StyleSheet.absoluteFill}
          glassEffectStyle="regular"
          isInteractive
          colorScheme={isDark ? 'dark' : 'light'}
        />
      ) : useBlurView ? (
        <BlurView
          tint={activeTint}
          intensity={intensity}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
      ) : null}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  content: {
    zIndex: 1,
  },
});
