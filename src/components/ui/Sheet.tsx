import React, { useCallback } from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { BottomSheet } from "@expo/ui/community/bottom-sheet";
import {
  Colors,
  ControlTokens,
  getMinimumTouchTarget,
  Spacing,
} from "@/theme/tokens";
import { useIsDark } from "@/theme/useResolvedTheme";
import { Typography } from "./Typography";

export interface SheetProps {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  dismissible?: boolean;
  snapPoints?: (string | number)[];
  surfaceStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

const DEFAULT_SNAP_POINTS: (string | number)[] = ["90%"];

export const Sheet: React.FC<SheetProps> = ({
  visible,
  onRequestClose,
  children,
  title,
  subtitle,
  headerAction,
  footer,
  accessibilityLabel,
  accessibilityHint,
  dismissible = true,
  snapPoints = DEFAULT_SNAP_POINTS,
  surfaceStyle,
  contentStyle,
  testID,
}) => {
  const isDark = useIsDark();
  const dialogLabel = accessibilityLabel ?? title ?? "Sheet";

  const handleDismiss = useCallback(() => {
    if (dismissible) {
      onRequestClose();
    }
  }, [dismissible, onRequestClose]);

  return (
    <BottomSheet
      index={visible ? 0 : -1}
      snapPoints={snapPoints}
      enablePanDownToClose={dismissible}
      onClose={handleDismiss}
      onDismiss={handleDismiss}
      backgroundStyle={[
        styles.sheetBackground,
        {
          backgroundColor: isDark ? Colors.surfaceDark : Colors.surfaceLight,
          borderColor: isDark ? Colors.borderDark : Colors.borderLight,
        },
        surfaceStyle,
      ]}
      style={styles.sheetContainer}
    >
      <View
        testID={testID}
        accessible
        role="dialog"
        accessibilityLabel={dialogLabel}
        accessibilityHint={accessibilityHint}
        style={styles.innerRoot}
      >
        {title || subtitle || headerAction ? (
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              {title ? <Typography variant="title">{title}</Typography> : null}
              {subtitle ? (
                <Typography
                  variant="caption"
                  color={
                    isDark
                      ? Colors.secondaryTextDark
                      : Colors.secondaryTextLight
                  }
                >
                  {subtitle}
                </Typography>
              ) : null}
            </View>
            {headerAction ? (
              <View
                style={[
                  styles.headerAction,
                  {
                    minWidth: getMinimumTouchTarget(Platform.OS),
                    minHeight: getMinimumTouchTarget(Platform.OS),
                  },
                ]}
              >
                {headerAction}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.content, contentStyle]}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  sheetContainer: {
    flex: 1,
  },
  sheetBackground: {
    borderTopLeftRadius: ControlTokens.sheetTopRadius,
    borderTopRightRadius: ControlTokens.sheetTopRadius,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  innerRoot: {
    flex: 1,
    paddingBottom: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: ControlTokens.sheetContentGap,
    paddingHorizontal: ControlTokens.sheetHorizontalPadding,
    paddingTop: Spacing.xs,
    paddingBottom: ControlTokens.sheetContentGap,
  },
  headerCopy: {
    flex: 1,
    gap: ControlTokens.fieldLabelGap,
  },
  headerAction: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    gap: ControlTokens.sheetContentGap,
    paddingHorizontal: ControlTokens.sheetHorizontalPadding,
  },
  footer: {
    paddingTop: ControlTokens.sheetContentGap,
    paddingHorizontal: ControlTokens.sheetHorizontalPadding,
  },
});
