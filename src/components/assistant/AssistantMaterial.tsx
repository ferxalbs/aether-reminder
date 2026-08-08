import React from 'react';
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
}

/** iOS 26 gets native Liquid Glass; Android and older iOS get platform-safe materials. */
export const AssistantMaterial: React.FC<AssistantMaterialProps> = ({
  children,
  style,
  borderRadius = Radius.xl,
}) => {
  const isDark = useIsDark();
  const useLiquidGlass =
    Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

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
          borderColor: isDark ? Colors.glassBorderDark : Colors.glassBorderLight,
          backgroundColor: isDark ? Colors.zinc900 : Colors.white,
        },
        style,
      ]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView
          tint={isDark ? 'dark' : 'light'}
          intensity={72}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
      ) : null}
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
    zIndex: 1,
  },
});
