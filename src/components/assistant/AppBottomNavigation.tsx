import React, { type RefObject, useEffect, useState } from "react";
import { Keyboard, Platform, StyleSheet, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { CalendarDays, CheckCircle2, ListTodo, Mic } from "lucide-react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  AnimatedPressable,
  getMinimumTouchTargetHitSlop,
} from "@/components/ui/AnimatedPressable";
import { Typography } from "@/components/ui/Typography";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { LayoutTokens, Motion, Spacing } from "@/theme/tokens";
import { useMotionPreset } from "@/motion";
import { useAetherTheme } from "@/theme/useAetherTheme";
import { useBottomChromeGeometry } from "@/theme/useBottomChromeGeometry";
import { useAssistantActions, useAssistantActive } from "./AssistantHost";

type Destination = "/" | "/tasks" | "/all";

const navigationItems = [
  { destination: "/" as const, label: "Today", icon: CheckCircle2 },
  { destination: "/tasks" as const, label: "Schedule", icon: CalendarDays },
  { destination: "/all" as const, label: "Reminders", icon: ListTodo },
];

interface AppBottomNavigationProps {
  blurTarget?: RefObject<View | null>;
}

export function AppBottomNavigation({ blurTarget }: AppBottomNavigationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useAetherTheme();
  const { colors } = theme;
  const geometry = useBottomChromeGeometry();
  const { startVoiceAssistant } = useAssistantActions();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const assistantActive = useAssistantActive();

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (
    keyboardVisible ||
    assistantActive ||
    pathname === "/settings" ||
    pathname === "/capture"
  ) {
    return null;
  }

  const isActive = (destination: Destination) =>
    pathname === destination || (destination === "/" && pathname === "/index");

  return (
    <View
      style={[styles.host, { bottom: geometry.navigationBottom }]}
      pointerEvents="box-none"
    >
      <GlassSurface
        blurTarget={blurTarget}
        borderRadius={theme.shape.pill}
        intensity={Platform.OS === "ios" ? 65 : 45}
        tier={Platform.OS === "android" ? "A" : undefined}
        style={styles.capsule}
        contentStyle={styles.navigation}
        accessible
        accessibilityRole="tablist"
      >
        {navigationItems.map((item) => (
          <NavigationButton
            key={item.destination}
            item={item}
            active={isActive(item.destination)}
            onPress={() => {
              if (!isActive(item.destination))
                router.navigate(item.destination);
            }}
          />
        ))}
      </GlassSurface>

      <GlassSurface
        blurTarget={blurTarget}
        borderRadius={theme.shape.pill}
        intensity={Platform.OS === "ios" ? 65 : 45}
        tier={Platform.OS === "android" ? "A" : undefined}
        style={styles.voiceCapsule}
        contentStyle={styles.voiceContent}
      >
        <AnimatedPressable
          onPress={startVoiceAssistant}
          accessibilityRole="button"
          accessibilityLabel="Start voice input"
          accessibilityHint="Speak naturally to create or manage reminders"
          android_ripple={{ color: colors.ripple, foreground: true }}
          interactionRadius={theme.shape.pill}
          scaleTo={Motion.iconPressScale}
          hitSlop={getMinimumTouchTargetHitSlop(
            LayoutTokens.navigationHeight,
            LayoutTokens.navigationHeight,
            Platform.OS,
          )}
          style={[styles.voiceButton, { borderRadius: theme.shape.pill }]}
        >
          <Mic
            size={theme.layout.navigationVoiceIconSize}
            color={colors.accent}
            strokeWidth={theme.control.navigationVoiceIconStrokeWidth}
          />
        </AnimatedPressable>
      </GlassSurface>
    </View>
  );
}

const NavigationButton = React.memo(function NavigationButton({
  item,
  active,
  onPress,
}: {
  item: (typeof navigationItems)[number];
  active: boolean;
  onPress: () => void;
}) {
  const theme = useAetherTheme();
  const { colors } = theme;
  const navigationTokens = theme.components.navigation;
  const reduceMotion = useReducedMotion();
  const selectionPreset = useMotionPreset("navigation.tab");
  const selected = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    const nextValue = active ? 1 : 0;
    selected.value =
      reduceMotion || selectionPreset.mode === "none"
        ? nextValue
        : selectionPreset.mode === "spring"
          ? withSpring(nextValue, {
              damping: selectionPreset.damping,
              stiffness: selectionPreset.stiffness,
              mass: selectionPreset.mass,
            })
          : withTiming(nextValue, { duration: selectionPreset.durationMs });
  }, [active, reduceMotion, selected, selectionPreset]);

  const indicatorStyle = useAnimatedStyle(() => ({ opacity: selected.value }));
  const Icon = item.icon;

  const highlightBg = navigationTokens.indicatorActive;

  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      android_ripple={{ color: colors.ripple, foreground: true }}
      interactionRadius={theme.shape.pill}
      scaleTo={0.98}
      style={[styles.item, { borderRadius: theme.shape.pill }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.selected,
          { borderRadius: theme.shape.pill },
          { backgroundColor: highlightBg },
          indicatorStyle,
        ]}
      />
      <Icon
        size={theme.layout.navigationIconSize}
        color={
          active ? navigationTokens.iconActive : navigationTokens.iconInactive
        }
        strokeWidth={
          active
            ? theme.control.navigationIconSelectedStrokeWidth
            : theme.control.navigationIconStrokeWidth
        }
      />
      <Typography
        variant="tiny"
        color={
          active ? navigationTokens.labelActive : navigationTokens.labelInactive
        }
        numberOfLines={1}
      >
        {item.label}
      </Typography>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: Spacing.sm,
    maxWidth: LayoutTokens.navigationMaxWidth,
    alignSelf: "center",
    zIndex: 100,
  },
  capsule: {
    flex: 1,
    height: LayoutTokens.navigationHeight,
  },
  navigation: {
    flex: 1,
    height: LayoutTokens.navigationHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: Spacing.xs,
  },
  voiceCapsule: {
    width: LayoutTokens.navigationHeight,
    height: LayoutTokens.navigationHeight,
  },
  voiceContent: {
    width: LayoutTokens.navigationHeight,
    height: LayoutTokens.navigationHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceButton: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  item: {
    flex: 1,
    height: LayoutTokens.navigationItemHeight,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  selected: {
    position: "absolute",
    top: Spacing.xs,
    right: Spacing.xs,
    bottom: Spacing.xs,
    left: Spacing.xs,
  },
});
