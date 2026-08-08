import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';

export interface WaveformViewProps {
  isRecording: boolean;
  barCount?: number;
}

const WaveformBar: React.FC<{ isRecording: boolean; index: number; isDark: boolean }> = React.memo(({
  isRecording,
  index,
  isDark,
}) => {
  const height = useSharedValue(12);

  useEffect(() => {
    if (isRecording) {
      const randomTarget = 16 + (index % 4) * 12 + Math.random() * 20;
      const duration = 280 + (index % 5) * 60;
      height.value = withRepeat(
        withSequence(
          withTiming(randomTarget, { duration }),
          withTiming(10, { duration })
        ),
        -1,
        true
      );
    } else {
      height.value = withTiming(8, { duration: 300 });
    }
  }, [isRecording, index, height]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          backgroundColor: isRecording
            ? isDark
              ? Colors.white
              : Colors.black
            : Colors.zinc600,
        },
        animatedStyle,
      ]}
    />
  );
});

export const WaveformView: React.FC<WaveformViewProps> = ({
  isRecording,
  barCount = 14,
}) => {
  const isDark = useIsDark();
  const bars = Array.from({ length: barCount }, (_, i) => i);

  return (
    <View style={styles.container}>
      {bars.map((i) => (
        <WaveformBar key={i} isRecording={isRecording} index={i} isDark={isDark} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  bar: {
    width: 4,
    borderRadius: Radius.pill,
  },
});
