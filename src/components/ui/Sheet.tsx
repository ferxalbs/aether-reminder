import React, { useEffect, useState } from 'react';
import {
  Modal as NativeModal,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  useWindowDimensions,
  Platform,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { Colors, ControlTokens, getMinimumTouchTarget, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { GlassSurface } from './GlassSurface';
import { AdaptiveBlur, useMotionPreset } from '@/motion';
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

// Apple design physics projection and rubberbanding
function project(initialVelocity: number, decelerationRate = 0.998) {
  'worklet';
  return (initialVelocity / 1000) * decelerationRate / (1 - decelerationRate);
}

function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  'worklet';
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

// Apple-like spring: stiffness 300, damping 35 (critically damped)
const SPRING_CONFIG = { damping: 35, stiffness: 300 };

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
  const sheetPreset = useMotionPreset('sheet.present');
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  
  const [mounted, setMounted] = useState(visible);
  
  const translateY = useSharedValue(height);
  const opacity = useSharedValue(0);

  const dialogLabel = accessibilityLabel ?? title ?? 'Sheet';
  const shouldRender = visible || mounted;

  useEffect(() => {
    if (visible) {
      if (reduceMotion || sheetPreset.mode === 'none') {
        translateY.set(0);
        opacity.set(withTiming(1, { duration: 150 }));
      } else {
        opacity.set(withTiming(1, { duration: 250 }));
        translateY.set(withSpring(0, SPRING_CONFIG));
      }
      return;
    }

    if (!mounted) return;

    if (reduceMotion || sheetPreset.mode === 'none') {
      opacity.set(withTiming(0, { duration: 150 }, () => {
        scheduleOnRN(setMounted, false);
      }));
    } else {
      opacity.set(withTiming(0, { duration: 200 }));
      translateY.set(withSpring(height, SPRING_CONFIG, () => {
        scheduleOnRN(setMounted, false);
      }));
    }
  }, [height, mounted, opacity, reduceMotion, sheetPreset, translateY, visible]);

  const handleRequestClose = () => {
    if (dismissible) onRequestClose();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (!dismissible) return;
      if (e.translationY > 0) {
        translateY.set(e.translationY);
      } else {
        translateY.set(-rubberband(-e.translationY, height));
      }
    })
    .onEnd((e) => {
      if (!dismissible) return;
      const projectedEndpoint = e.translationY + project(e.velocityY);
      const threshold = height * 0.15;

      if (projectedEndpoint > threshold || e.velocityY > 600) {
        translateY.set(withSpring(height, { ...SPRING_CONFIG, velocity: e.velocityY }, () => {
          scheduleOnRN(handleRequestClose);
        }));
      } else {
        translateY.set(withSpring(0, { ...SPRING_CONFIG, velocity: e.velocityY }));
      }
    });

  const animatedSurfaceStyle = useAnimatedStyle(() => {
    // Premium Apple-style micro-animation: slightly scale up as it enters
    const scale = interpolate(
      translateY.value,
      [height, 0],
      [0.97, 1],
      Extrapolation.CLAMP
    );
    
    return {
      transform: [
        { translateY: translateY.value },
        { scale },
      ],
      // Anchor the scale to the center so it doesn't clip
      transformOrigin: 'center center',
    };
  });

  const animatedScrimStyle = useAnimatedStyle(() => {
    // Fade out the scrim proportionally as the sheet is dragged down
    const progress = interpolate(
      translateY.value,
      [0, height],
      [1, 0],
      Extrapolation.CLAMP
    );
    
    return {
      opacity: opacity.value * progress,
    };
  });

  if (!shouldRender) return null;

  return (
    <NativeModal
      visible={shouldRender}
      transparent={true}
      animationType="none"
      onRequestClose={handleRequestClose}
      testID={testID}
    >
      <GestureHandlerRootView style={styles.modalRoot}>
        <Animated.View style={[StyleSheet.absoluteFill, animatedScrimStyle]}>
          <AdaptiveBlur
            intensity={30}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Dismiss ${title ?? 'sheet'}`}
            accessibilityHint="Closes this sheet"
            accessibilityState={{ disabled: !dismissible }}
            disabled={!dismissible}
            onPress={handleRequestClose}
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: isDark ? Colors.scrimDark : Colors.scrimLight },
            ]}
          />
        </Animated.View>

        <Animated.View
          accessible
          role="dialog"
          accessibilityLabel={dialogLabel}
          accessibilityHint={accessibilityHint}
          style={[
            styles.surface,
            {
              backgroundColor: 'transparent',
              borderColor: isDark ? Colors.borderDark : Colors.borderLight,
              marginHorizontal: Spacing.md,
              marginBottom: Math.max(insets.bottom, Spacing.md),
            },
            animatedSurfaceStyle,
            surfaceStyle,
          ]}
        >
          <GlassSurface
            pointerEvents="none"
            borderRadius={36}
            borderWidth={0}
            style={StyleSheet.absoluteFill}
          />

          <GestureDetector gesture={panGesture}>
            <View style={styles.gestureHeader}>
              <View
                style={[
                  styles.handle,
                  { backgroundColor: isDark ? Colors.tertiaryTextDark : Colors.tertiaryTextLight },
                ]}
                accessible={false}
              />
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
            </View>
          </GestureDetector>

          <View style={[styles.content, contentStyle]}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </GestureHandlerRootView>
    </NativeModal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  surface: {
    flex: 1,
    maxHeight: ControlTokens.sheetMaxHeight,
    borderRadius: 36,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 24,
  },
  gestureHeader: {
    paddingTop: ControlTokens.sheetContentGap,
    paddingHorizontal: ControlTokens.sheetHorizontalPadding,
  },
  handle: {
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
    paddingHorizontal: ControlTokens.sheetHorizontalPadding,
  },
  footer: {
    paddingTop: ControlTokens.sheetContentGap,
    paddingHorizontal: ControlTokens.sheetHorizontalPadding,
  },
});
