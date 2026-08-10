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

/** iOS 26 gets native Liquid Glass; Android and older iOS get platform-safe materials. */
export const AssistantMaterial: React.FC<AssistantMaterialProps> = ({
  children,
  style,
  borderRadius = Radius.xl,
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
          backgroundColor: isDark ? Colors.surfaceDark : Colors.surfaceLight,
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
      ) : null}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            backgroundColor: isDark ? 'rgba(16, 27, 39, 0.62)' : 'rgba(255, 255, 255, 0.58)',
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
    borderCurve: 'continuous',
    boxShadow: '0 8px 26px rgba(8, 18, 31, 0.16)',
  },
  content: {
    flex: 1,
    zIndex: 1,
  },
});
