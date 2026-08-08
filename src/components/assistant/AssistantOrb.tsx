import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Colors, Radius } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import type { AssistantOrbState } from './assistantTypes';

interface AssistantOrbProps {
  state: AssistantOrbState;
  expanded: boolean;
  size?: 'dock' | 'composer';
  onPress: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  onPressMove?: (event: { nativeEvent: { pageY: number } }) => void;
  audioLevel?: number;
}

const stateLabels: Record<AssistantOrbState, string> = {
  idle: 'Ready',
  opening: 'Opening assistant',
  contextualizing: 'Preparing context',
  thinking: 'Thinking',
  executing: 'Executing action',
  waiting_confirmation: 'Waiting for confirmation',
  responding: 'Responding',
  error: 'Needs attention',
  closing: 'Closing',
  connecting: 'Connecting voice transcription',
  listening: 'Listening',
  finalizing: 'Finalizing recording',
  transcribing: 'Transcribing',
};

function getOrbColor(state: AssistantOrbState): string {
  if (state === 'error') return '#FF6B6B';
  if (state === 'waiting_confirmation') return '#F4B942';
  if (state === 'connecting' || state === 'listening' || state === 'transcribing' || state === 'finalizing') return '#65D6C0';
  if (state === 'thinking' || state === 'executing' || state === 'responding') return '#91A5FF';
  return '#7FE0C2';
}

export const AssistantOrb: React.FC<AssistantOrbProps> = ({
  state,
  expanded,
  size = 'dock',
  onPress,
  onPressIn,
  onPressOut,
  onPressMove,
  audioLevel = 0,
}) => {
  const isDark = useIsDark();
  const useLiquidGlass =
    process.env.EXPO_OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  const [reduceMotion, setReduceMotion] = useState(false);
  const motion = useSharedValue(0);
  const isBusy =
    state === 'thinking' ||
    state === 'executing' ||
    state === 'responding' ||
    state === 'connecting' ||
    state === 'listening' ||
    state === 'finalizing' ||
    state === 'transcribing';
  const color = getOrbColor(state);
  const orbSize = size === 'dock' ? 44 : 38;

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion || !isBusy) {
      motion.value = withTiming(0, { duration: 140 });
      return;
    }
    motion.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [isBusy, motion, reduceMotion]);

  const animatedOrbStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + motion.value * 0.055 },
      { translateY: -motion.value * 1.5 },
    ],
  }));

  const animatedGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.12 + motion.value * 0.14,
    transform: [{ scale: 1 + motion.value * 0.34 }],
  }));

  const foreground = isDark ? Colors.white : Colors.zinc950;

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPressMove={onPressMove}
      scaleTo={0.9}
      accessibilityRole="button"
      accessibilityLabel={expanded ? 'Close AETHER assistant' : 'Open AETHER assistant'}
      accessibilityHint="Tap to open AETHER. Hold to talk."
      accessibilityState={{ expanded, busy: isBusy }}
      style={[styles.touchTarget, size === 'composer' && styles.composerTouchTarget]}
    >
      <Animated.View style={[styles.glow, { width: orbSize, height: orbSize, backgroundColor: color }, animatedGlowStyle, { opacity: 0.12 + Math.min(1, audioLevel) * 0.22 }]} />
      <Animated.View
        style={[
          styles.orb,
          { width: orbSize, height: orbSize, borderRadius: orbSize / 2, borderColor: color },
          animatedOrbStyle,
        ]}
      >
        {useLiquidGlass ? (
          <GlassView
            style={[StyleSheet.absoluteFill, { borderRadius: orbSize / 2 }]}
            glassEffectStyle="regular"
            isInteractive
            colorScheme={isDark ? 'dark' : 'light'}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.fallbackOrb, { borderRadius: orbSize / 2, backgroundColor: `${color}D9` }]} />
        )}
        <View style={[styles.highlight, { backgroundColor: isDark ? 'rgba(255,255,255,0.74)' : 'rgba(255,255,255,0.9)' }]} />
        <View style={[styles.core, { backgroundColor: foreground, width: 7 + Math.min(1, audioLevel) * 8, height: 7 + Math.min(1, audioLevel) * 8 }]} />
        <View
          accessible
          accessibilityLabel={`Assistant state: ${stateLabels[state]}`}
          style={[styles.stateDot, { backgroundColor: state === 'error' ? '#FFB4B4' : color }]}
        />
      </Animated.View>
    </AnimatedPressable>
  );
};

export const assistantStateLabel = (state: AssistantOrbState): string => stateLabels[state];

const styles = StyleSheet.create({
  touchTarget: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerTouchTarget: {
    width: 46,
    height: 46,
  },
  glow: {
    position: 'absolute',
    borderRadius: Radius.pill,
  },
  orb: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.24)',
  },
  fallbackOrb: {
    borderWidth: 0,
  },
  highlight: {
    position: 'absolute',
    top: '17%',
    left: '19%',
    width: '30%',
    height: '22%',
    borderRadius: Radius.pill,
    transform: [{ rotate: '-28deg' }],
  },
  core: {
    width: 7,
    height: 7,
    borderRadius: Radius.pill,
    opacity: 0.82,
  },
  stateDot: {
    position: 'absolute',
    right: '12%',
    bottom: '12%',
    width: 6,
    height: 6,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.75)',
  },
});
