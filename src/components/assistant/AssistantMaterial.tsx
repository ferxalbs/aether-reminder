import React, { type RefObject } from 'react';
import { BlurView } from 'expo-blur';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors, Radius } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';

interface AssistantMaterialProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  blurTarget?: RefObject<View | null>;
}

/** Crisp, minimal monochrome material surface for floating toolbars and panels. */
export const AssistantMaterial: React.FC<AssistantMaterialProps> = ({
  children,
  style,
  borderRadius = Radius.xl,
  blurTarget,
}) => {
  const isDark = useIsDark();
  const useLiquidGlass =
    process.env.EXPO_OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

  if (useLiquidGlass) {
    return (
      <View style={[styles.clip, { borderRadius }, style]}>
        <GlassView
          style={StyleSheet.absoluteFill}
          glassEffectStyle="regular"
          isInteractive
          colorScheme={isDark ? 'dark' : 'light'}
        />
        <View style={styles.content}>{children}</View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.clip,
        styles.fallback,
        {
          borderRadius,
          borderColor: isDark ? Colors.borderDark : Colors.borderLight,
          backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight,
        },
        style,
      ]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView
          tint={isDark ? 'systemMaterialDark' : 'systemMaterialLight'}
          intensity={82}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
      ) : blurTarget ? (
        <BlurView
          tint={isDark ? 'dark' : 'light'}
          intensity={72}
          blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus"
          blurReductionFactor={3}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            backgroundColor: isDark ? Colors.glassDark : Colors.glassLight,
          },
        ]}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  fallback: {
    borderWidth: 1,
  },
  content: {
    flex: 1,
    zIndex: 1,
  },
});
