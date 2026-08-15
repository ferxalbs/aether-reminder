import React, { useEffect, useState } from 'react';
import {
  Modal as NativeModal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import { Colors, ControlTokens, getMinimumTouchTarget, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { GlassSurface } from './GlassSurface';
import { useMotionPreset } from '@/motion';
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
  
  const [mounted, setMounted] = useState(visible);
  
  const translateY = useSharedValue(height);
  const opacity = useSharedValue(0);

  const surfaceBackgroundColor = isDark ? Colors.surfaceRaisedDark : Colors.surfaceLight;
  const dialogLabel = accessibilityLabel ?? title ?? 'Sheet';

  useEffect(() => {
    if (visible) {
      setMounted(true);
      if (reduceMotion || sheetPreset.mode === 'none') {
        translateY.value = 0;
        opacity.value = withTiming(1, { duration: 150 });
      } else {
        opacity.value = withTiming(1, { duration: 250 });
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    } else {
      if (reduceMotion || sheetPreset.mode === 'none') {
        opacity.value = withTiming(0, { duration: 150 }, () => {
          runOnJS(setMounted)(false);
        });
      } else {
        opacity.value = withTiming(0, { duration: 200 });
        translateY.value = withSpring(height, SPRING_CONFIG, () => {
          runOnJS(setMounted)(false);
        });
      }
    }
  }, [visible]);

  const handleRequestClose = () => {
    if (dismissible) onRequestClose();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (!dismissible) return;
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      } else {
        translateY.value = -rubberband(-e.translationY, height);
      }
    })
    .onEnd((e) => {
      if (!dismissible) return;
      const projectedEndpoint = e.translationY + project(e.velocityY);
      const threshold = height * 0.15; 
      
      if (projectedEndpoint > threshold || e.velocityY > 600) {
        translateY.value = withSpring(height, { ...SPRING_CONFIG, velocity: e.velocityY }, () => {
          runOnJS(handleRequestClose)();
        });
      } else {
        translateY.value = withSpring(0, { ...SPRING_CONFIG, velocity: e.velocityY });
      }
    });

  const animatedSurfaceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

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
      backgroundColor: 'rgba(0,0,0,0.4)',
    };
  });

  if (!mounted) return null;

  return (
    <NativeModal
      visible={true}
      transparent={true}
      animationType="none"
      onRequestClose={handleRequestClose}
      testID={testID}
    >
      <GestureHandlerRootView style={styles.modalRoot}>
        <Animated.View style={[StyleSheet.absoluteFill, animatedScrimStyle]}>
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
              backgroundColor: surfaceBackgroundColor,
              borderColor: isDark ? Colors.borderDark : Colors.borderLight,
            },
            animatedSurfaceStyle,
            surfaceStyle,
          ]}
        >
          {Platform.OS === 'ios' ? (
            <GlassSurface
              pointerEvents="none"
              borderRadius={ControlTokens.sheetTopRadius}
              borderWidth={0}
              style={StyleSheet.absoluteFill}
            />
          ) : null}

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
    borderTopLeftRadius: ControlTokens.sheetTopRadius,
    borderTopRightRadius: ControlTokens.sheetTopRadius,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
    paddingBottom: Spacing.lg,
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
