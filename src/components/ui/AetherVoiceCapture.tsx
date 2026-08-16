import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { Typography } from "./Typography";
import { Hairline, Spacing } from "@/theme/tokens";
import { useMotionProfile } from "@/motion";
import { useSemanticColors } from "@/theme/useSemanticColors";

export type VoiceCaptureState =
  "listening" | "processing" | "review" | "committed";

export interface AetherVoiceCaptureProps {
  state: VoiceCaptureState;
  transcript?: string;
  audioLevel?: SharedValue<number>;
}

function MeterLine({ level }: { level?: SharedValue<number> }) {
  const profile = useMotionProfile();
  const colors = useSemanticColors();
  const allowMeter = profile.budget.allowContinuousDecorativeMotion;
  const animatedStyle = useAnimatedStyle(() => {
    if (!allowMeter) {
      return { transform: [{ scaleY: 1 }] };
    }
    const scaleY = level ? Math.max(0.2, Math.min(level.value * 2, 3)) : 1;
    return {
      transform: [{ scaleY }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.meterLine,
        { backgroundColor: colors.accent },
        animatedStyle,
      ]}
    />
  );
}

export const AetherVoiceCapture: React.FC<AetherVoiceCaptureProps> = ({
  state,
  transcript,
  audioLevel,
}) => {
  const colors = useSemanticColors();

  const stateLabel =
    state === "listening"
      ? "Listening…"
      : state === "processing"
        ? "Processing…"
        : state === "review"
          ? "Ready for review"
          : "Committed";

  return (
    <View style={styles.container}>
      <Typography variant="caption" color={colors.textSecondary}>
        {stateLabel}
      </Typography>

      {transcript ? (
        <Typography variant="headline" style={styles.transcript}>
          {transcript}
        </Typography>
      ) : null}

      {state === "listening" ? (
        <View
          style={[
            styles.meterContainer,
            { backgroundColor: colors.borderSubtle },
          ]}
        >
          <MeterLine level={audioLevel} />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  transcript: {
    fontSize: 22,
    lineHeight: 28,
  },
  meterContainer: {
    height: 2,
    width: "100%",
    justifyContent: "center",
    marginTop: Spacing.xs,
  },
  meterLine: {
    height: Hairline.width * 2,
    width: "100%",
  },
});
