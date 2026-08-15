import React, { type RefObject } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView, type BlurViewProps } from 'expo-blur';
import { Colors } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { useMotionProfile } from '../runtime/useMotionProfile';
import { resolveAdaptiveBlurPolicy } from './blurPolicy';

export interface AdaptiveBlurProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: BlurViewProps['tint'];
  blurTarget?: RefObject<View | null>;
  testID?: string;
}

export function AdaptiveBlur({
  children,
  style,
  intensity = 45,
  tint,
  blurTarget,
  testID,
}: AdaptiveBlurProps) {
  const isDark = useIsDark();
  const profile = useMotionProfile();
  const decision = resolveAdaptiveBlurPolicy({
    profile,
    accessibility: {
      reduceMotion: profile.reduceMotion,
      reduceTransparency: profile.reduceTransparency,
      prefersCrossFade: profile.prefersCrossFade,
    },
    platform: Platform.OS,
    androidApiLevel: profile.androidApiLevel,
  });

  const fallbackBg = isDark ? Colors.glassDarkFallback : Colors.glassLightFallback;
  const glassBg = isDark ? Colors.glassDark : Colors.glassLight;
  const resolvedTint = tint ?? (isDark ? 'dark' : 'light');
  const useNative = decision.mode === 'native' && (Platform.OS !== 'android' || Boolean(blurTarget));

  return (
    <View
      testID={testID}
      style={[styles.fill, { backgroundColor: useNative ? glassBg : fallbackBg }, style]}
    >
      {useNative ? (
        <BlurView
          intensity={intensity}
          tint={resolvedTint}
          blurTarget={blurTarget}
          blurMethod={decision.blurMethod}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    overflow: 'hidden',
  },
});
