import React, { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, {
  Layout,
  useAnimatedStyle,
  useReducedMotion,
  withSpring,
} from "react-native-reanimated";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { Typography } from "@/components/ui/Typography";
import { selectionAsync } from "@/lib/haptics";
import { reportNonFatalError } from "@/lib/nonFatalError";
import { useSettingsStore } from "@/stores/settings.store";
import { Hairline, Radius, Spacing } from "@/theme/tokens";
import { useAetherTheme } from "@/theme/useAetherTheme";
import { ChevronDown, Info, Shield } from "lucide-react-native";
import { SettingsCard } from "./SettingsCard";

const accordionLayout =
  Platform.OS === "ios"
    ? Layout.springify().damping(20).stiffness(200)
    : undefined;

interface AccordionItemProps {
  icon: React.ReactNode;
  title: string;
  content: string;
  isExpanded: boolean;
  onToggle: () => void;
}

const AccordionItem: React.FC<AccordionItemProps> = React.memo(
  ({ icon, title, content, isExpanded, onToggle }) => {
    const { colors } = useAetherTheme();
    const reduceMotion = useReducedMotion();

    const chevronStyle = useAnimatedStyle(() => {
      if (reduceMotion) {
        return {
          transform: [{ rotate: isExpanded ? "180deg" : "0deg" }],
        };
      }
      return {
        transform: [
          {
            rotate: withSpring(isExpanded ? "180deg" : "0deg", {
              damping: 18,
              stiffness: 180,
            }),
          },
        ],
      };
    }, [isExpanded, reduceMotion]);

    return (
      <Animated.View layout={accordionLayout}>
        <AnimatedPressable
          onPress={onToggle}
          scaleTo={0.99}
          interactionRadius={Radius.md}
          android_ripple={{ color: colors.ripple, foreground: true }}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          accessibilityLabel={title}
          style={styles.headerPressable}
        >
          <View style={styles.headerRow}>
            <View style={styles.iconContainer}>{icon}</View>
            <Typography
              variant="bodyBold"
              style={[styles.title, { color: colors.textPrimary }]}
            >
              {title}
            </Typography>
            <Animated.View style={chevronStyle}>
              <ChevronDown size={18} color={colors.textSecondary} />
            </Animated.View>
          </View>
        </AnimatedPressable>

        {isExpanded ? (
          <Animated.View layout={accordionLayout} style={styles.body}>
            <Typography
              variant="body"
              color={colors.textSecondary}
              style={styles.bodyText}
            >
              {content}
            </Typography>
          </Animated.View>
        ) : null}
      </Animated.View>
    );
  },
);

AccordionItem.displayName = "AccordionItem";

export const SettingsAccordion: React.FC = React.memo(() => {
  const { colors } = useAetherTheme();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const [showAbout, setShowAbout] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const toggleAbout = () => {
    setShowAbout((v) => !v);
    if (hapticsEnabled) {
      selectionAsync().catch((error: unknown) => {
        reportNonFatalError("haptics", error);
      });
    }
  };

  const togglePrivacy = () => {
    setShowPrivacy((v) => !v);
    if (hapticsEnabled) {
      selectionAsync().catch((error: unknown) => {
        reportNonFatalError("haptics", error);
      });
    }
  };

  return (
    <SettingsCard>
      {/* About AETHER */}
      <AccordionItem
        icon={<Info size={20} color={colors.accent} />}
        title="About AETHER"
        content="AETHER is a local-first, privacy-respecting task assistant. Reminders, tasks, and notifications run directly on your device. Hosted intelligence and voice are powered by AETHER Cloud."
        isExpanded={showAbout}
        onToggle={toggleAbout}
      />

      <View
        style={[styles.divider, { backgroundColor: colors.borderDefault }]}
      />

      {/* Privacy Information */}
      <AccordionItem
        icon={<Shield size={20} color={colors.accent} />}
        title="Privacy Information"
        content="Your tasks, reminders, and database remain strictly local on your device. When you ask AETHER or use voice capture, requests are processed securely through AETHER Cloud with zero permanent retention of personal task content. No user API keys required."
        isExpanded={showPrivacy}
        onToggle={togglePrivacy}
      />
    </SettingsCard>
  );
});


SettingsAccordion.displayName = "SettingsAccordion";

const styles = StyleSheet.create({
  headerPressable: {
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
  },
  title: {
    flex: 1,
    fontWeight: "600",
  },
  body: {
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    paddingLeft: 36,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 21,
  },
  divider: {
    height: Hairline.width,
    marginVertical: Spacing.xs,
  },
});
