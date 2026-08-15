import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import type { MotionPresetId } from '../core/types';
import { useMotionPreset } from '../runtime/useMotionPreset';

export interface AdaptiveAnimatedSurfaceProps {
  children: React.ReactNode;
  preset?: MotionPresetId;
  style?: StyleProp<ViewStyle>;
}

export function AdaptiveAnimatedSurface({
  children,
  preset = 'navigation.push',
  style,
}: AdaptiveAnimatedSurfaceProps) {
  const resolved = useMotionPreset(preset);
  const entering = resolved.mode === 'none'
    ? undefined
    : resolved.translateY > 0
      ? FadeInDown.duration(resolved.durationMs).springify().damping(resolved.damping).stiffness(resolved.stiffness)
      : FadeIn.duration(resolved.durationMs);
  const exiting = resolved.mode === 'none' ? undefined : FadeOut.duration(Math.min(resolved.durationMs, 160));

  return (
    <Animated.View entering={entering} exiting={exiting} style={style}>
      {children}
    </Animated.View>
  );
}
