import React from 'react';
import {
  Modal as NativeModal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Colors, ControlTokens, getMinimumTouchTarget, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { GlassSurface } from './GlassSurface';
import { Typography } from './Typography';

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
  surfaceStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

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
  surfaceStyle,
  contentStyle,
  testID,
}) => {
  const isDark = useIsDark();
  const reduceMotion = useReducedMotion();
  const isIOS = Platform.OS === 'ios';
  const isAndroid = Platform.OS === 'android';
  const surfaceBackgroundColor = isDark ? Colors.surfaceRaisedDark : Colors.surfaceLight;
  const dialogLabel = accessibilityLabel ?? title ?? 'Sheet';

  const handleRequestClose = () => {
    if (dismissible) onRequestClose();
  };

  return (
    <NativeModal
      visible={visible}
      transparent={isAndroid}
      animationType={reduceMotion ? 'none' : 'slide'}
      presentationStyle={isIOS ? 'pageSheet' : undefined}
      allowSwipeDismissal={isIOS && dismissible}
      statusBarTranslucent={isAndroid}
      navigationBarTranslucent={isAndroid}
      onRequestClose={handleRequestClose}
      testID={testID}
    >
      <View
        style={[
          styles.modalRoot,
          isAndroid && styles.androidRoot,
          { backgroundColor: isAndroid ? 'transparent' : surfaceBackgroundColor },
        ]}
      >
        {isAndroid ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Dismiss ${title ?? 'sheet'}`}
            accessibilityHint="Closes this sheet"
            accessibilityState={{ disabled: !dismissible }}
            disabled={!dismissible}
            onPress={handleRequestClose}
            android_ripple={{ color: isDark ? Colors.rippleDark : Colors.rippleLight }}
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: isDark ? Colors.scrimDark : Colors.scrimLight },
            ]}
          />
        ) : null}
        <View
          accessible
          role="dialog"
          accessibilityLabel={dialogLabel}
          accessibilityHint={accessibilityHint}
          accessibilityViewIsModal={isIOS}
          style={[
            styles.surface,
            isIOS && styles.iosSurface,
            isAndroid && [
              styles.androidSurface,
              {
                backgroundColor: surfaceBackgroundColor,
                borderColor: isDark ? Colors.borderDark : Colors.borderLight,
              },
            ],
            surfaceStyle,
          ]}
        >
          {isIOS ? (
            <GlassSurface
              pointerEvents="none"
              borderRadius={Radius.xl}
              borderWidth={0}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          {isAndroid ? (
            <View
              style={[
                styles.androidHandle,
                { backgroundColor: isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight },
              ]}
              accessible={false}
            />
          ) : null}
          {title || subtitle || headerAction ? (
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                {title ? <Typography variant="title">{title}</Typography> : null}
                {subtitle ? (
                  <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight}>
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
      </View>
    </NativeModal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  androidRoot: {
    justifyContent: 'flex-end',
  },
  surface: {
    flex: 1,
    overflow: 'hidden',
  },
  iosSurface: {
    paddingTop: Spacing.md,
  },
  androidSurface: {
    maxHeight: ControlTokens.sheetMaxHeight,
    paddingTop: ControlTokens.sheetContentGap,
    paddingHorizontal: ControlTokens.sheetHorizontalPadding,
    paddingBottom: Spacing.lg,
    borderTopLeftRadius: ControlTokens.sheetTopRadius,
    borderTopRightRadius: ControlTokens.sheetTopRadius,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  androidHandle: {
    alignSelf: 'center',
    width: ControlTokens.sheetHandleWidth,
    height: ControlTokens.sheetHandleHeight,
    marginBottom: ControlTokens.sheetContentGap,
    borderRadius: Radius.pill,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ControlTokens.sheetContentGap,
    paddingHorizontal: ControlTokens.sheetHorizontalPadding,
    paddingBottom: ControlTokens.sheetContentGap,
  },
  headerCopy: {
    flex: 1,
    gap: ControlTokens.fieldLabelGap,
  },
  headerAction: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: ControlTokens.sheetContentGap,
  },
  footer: {
    paddingTop: ControlTokens.sheetContentGap,
  },
});
