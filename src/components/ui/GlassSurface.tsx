import React, { createContext, type RefObject, useContext } from 'react';
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
  const inheritedBlurTarget = useContext(GlassBlurTargetContext);
  const borderColor = isDark ? Colors.borderDark : Colors.borderLight;
  const fallbackBg = isDark ? Colors.glassDarkFallback : Colors.glassLightFallback;
  const glassBg = isDark ? Colors.glassDark : Colors.glassLight;
  const resolvedTint = tint ?? (isDark ? 'dark' : 'light');

  // Tier C fallback or unsupported blur platforms (translucent no-blur material)
  if (tier === 'C') {
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
        blurTarget={blurTarget ?? inheritedBlurTarget}
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
