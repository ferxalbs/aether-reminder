import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
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
}

export const GlassSurface: React.FC<GlassSurfaceProps> = ({
  children,
  style,
  contentStyle,
  intensity = 60,
  tint,
  borderRadius = Radius.lg,
  borderWidth = 1,
}) => {
  const isDark = useIsDark();

  const activeTint = tint || (isDark ? 'dark' : 'light');
  const borderColor = isDark ? Colors.glassBorderDark : Colors.glassBorderLight;
  const backgroundColor = isDark ? (process.env.EXPO_OS === 'android' ? Colors.zinc900 : Colors.glassDark) : (process.env.EXPO_OS === 'android' ? Colors.white : Colors.glassLight);

  const useLiquidGlass =
    process.env.EXPO_OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  const useBlurView = process.env.EXPO_OS === 'ios';

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
