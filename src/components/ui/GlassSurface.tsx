import React, { createContext, useContext, type RefObject } from 'react';
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
  blurTarget?: RefObject<View | null>;
}

const GlassBlurTargetContext = createContext<RefObject<View | null> | undefined>(undefined);

export const GlassSurfaceProvider: React.FC<
  React.PropsWithChildren<{ blurTarget: RefObject<View | null> }>
> = ({ blurTarget, children }) => (
  <GlassBlurTargetContext.Provider value={blurTarget}>
    {children}
  </GlassBlurTargetContext.Provider>
);

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
  blurTarget,
}) => {
  const isDark = useIsDark();
  const isIOS = Platform.OS === 'ios';
  const isAndroid = Platform.OS === 'android';
  const contextBlurTarget = useContext(GlassBlurTargetContext);
  const resolvedBlurTarget = blurTarget ?? contextBlurTarget;

  const activeTint =
    tint ||
    (isAndroid
      ? isDark
        ? 'dark'
        : 'light'
      : isDark
        ? 'systemMaterialDark'
        : 'systemMaterialLight');
  const borderColor = isDark ? Colors.borderDark : Colors.borderLight;
  const backgroundColor = isDark ? 'rgba(16, 27, 39, 0.58)' : 'rgba(255, 255, 255, 0.58)';

  const useLiquidGlass =
    isIOS && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  // Android BlurView must be a sibling of its BlurTargetView. These reusable
  // surfaces can render inside that target, so use the solid fallback rather
  // than creating a recursive native blur capture during route transitions.
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
          blurTarget={isAndroid ? resolvedBlurTarget : undefined}
          blurMethod={isAndroid ? 'dimezisBlurViewSdk31Plus' : undefined}
          blurReductionFactor={isAndroid ? 3 : undefined}
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
    borderCurve: 'continuous',
    boxShadow: '0 8px 24px rgba(8, 18, 31, 0.13)',
  },
  content: {
    zIndex: 1,
  },
});
