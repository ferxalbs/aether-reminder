import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Sparkles, TriangleAlert } from 'lucide-react-native';
import { Colors, Radius } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import type { AssistantOrbState } from './assistantTypes';

interface AssistantOrbProps {
  state: AssistantOrbState;
  expanded: boolean;
  onPress: () => void;
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
};

export const AssistantOrb: React.FC<AssistantOrbProps> = ({ state, expanded, onPress }) => {
  const isDark = useIsDark();
  const [reduceMotion, setReduceMotion] = useState(false);
  const motion = useSharedValue(0);
  const isBusy = state === 'thinking' || state === 'executing' || state === 'responding';
  const isError = state === 'error';
  const isAttention = state === 'waiting_confirmation';

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
      motion.value = withTiming(0, { duration: 120 });
      return;
    }
    motion.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [isBusy, motion, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + motion.value * 0.055 }],
    opacity: 0.9 + motion.value * 0.1,
  }));

  const foreground = isDark ? Colors.black : Colors.white;
  const background = isError
    ? '#B42318'
    : isAttention
      ? '#B7791F'
      : isDark
        ? Colors.white
        : Colors.black;

  return (
    <AnimatedPressable
      onPress={onPress}
      scaleTo={0.93}
      accessibilityRole="button"
      accessibilityLabel={expanded ? 'Close AETHER assistant' : 'Open AETHER assistant'}
      accessibilityHint="Opens the universal assistant composer"
      accessibilityState={{ expanded, busy: isBusy }}
      style={styles.touchTarget}
    >
      <Animated.View
        style={[
          styles.orb,
          animatedStyle,
          {
            backgroundColor: background,
            borderColor: isError ? '#FDA29B' : isAttention ? '#FBD38D' : foreground,
          },
        ]}
      >
        {isError ? (
          <TriangleAlert size={22} color={foreground} strokeWidth={2.4} />
        ) : (
          <Sparkles size={22} color={foreground} strokeWidth={2.2} />
        )}
        <View
          accessible
          accessibilityLabel={`Assistant state: ${stateLabels[state]}`}
          style={[styles.stateDot, { backgroundColor: isError ? '#FDA29B' : isAttention ? '#FBD38D' : '#2F855A' }]}
        />
      </Animated.View>
    </AnimatedPressable>
  );
};

export const assistantStateLabel = (state: AssistantOrbState): string => stateLabels[state];

const styles = StyleSheet.create({
  touchTarget: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    width: 58,
    height: 58,
    borderRadius: Radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 9,
  },
  stateDot: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 7,
    height: 7,
    borderRadius: Radius.pill,
    backgroundColor: '#2F855A',
  },
});
