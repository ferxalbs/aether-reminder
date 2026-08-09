import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Typography } from '@/components/ui/Typography';
import { Colors, LayoutTokens, Motion, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { usePathname, useRouter } from 'expo-router';
import { CalendarDays, ListTodo, PenLine, Settings } from 'lucide-react-native';
import React, { useEffect, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AssistantMaterial } from './AssistantMaterial';

interface AppBottomNavigationProps {
  keyboardOffset: number;
  blurTarget?: RefObject<View | null>;
}

type Destination = '/' | '/tasks' | '/all' | '/settings';

const navigationItems: {
  key: string;
  destination: Destination;
  label: string;
  icon: typeof PenLine;
}[] = [
  { key: 'home', destination: '/', label: 'Compose', icon: PenLine },
  { key: 'tasks', destination: '/tasks', label: 'Upcoming', icon: CalendarDays },
  { key: 'all', destination: '/all', label: 'All', icon: ListTodo },
  { key: 'settings', destination: '/settings', label: 'Settings', icon: Settings },
];

export const AppBottomNavigation: React.FC<AppBottomNavigationProps> = ({
  keyboardOffset,
  blurTarget,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isDark = useIsDark();
  const keyboardVisible = keyboardOffset > 0;

  const navigate = (destination: Destination) => {
    const isHome = destination === '/' && (pathname === '/' || pathname === '/index');
    if (pathname === destination || isHome) return;
    router.replace(destination as never);
  };

  const dockStyle = useAnimatedStyle(() => ({
    opacity: withTiming(keyboardVisible ? 0 : 1, { duration: 160 }),
    transform: [{ translateY: withTiming(keyboardVisible ? 18 : 0, { duration: 180 }) }],
  }));

  return (
    <Animated.View
      pointerEvents={keyboardVisible ? 'none' : 'box-none'}
      style={[styles.host, { bottom: Math.max(insets.bottom, 8) + 10 }, dockStyle]}
    >
      <AssistantMaterial style={styles.bar} borderRadius={Radius.pill} blurTarget={blurTarget}>
        <View style={styles.navRow}>
          {navigationItems.map((item) => (
            <NavigationButton
              key={item.key}
              item={item}
              active={pathname === item.destination || (item.destination === '/' && pathname === '/index')}
              isDark={isDark}
              onPress={() => navigate(item.destination)}
            />
          ))}
        </View>
      </AssistantMaterial>
    </Animated.View>
  );
};

function NavigationButton({
  item,
  active,
  isDark,
  onPress,
}: {
  item: (typeof navigationItems)[number];
  active: boolean;
  isDark: boolean;
  onPress: () => void;
}) {
  const activeAnim = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    activeAnim.value = withSpring(active ? 1 : 0, {
      ...Motion.pressSpring,
    });
  }, [active, activeAnim]);

  const animatedIndicatorStyle = useAnimatedStyle(() => ({
    opacity: activeAnim.value * 0.92,
    transform: [{ scaleX: 0.76 + activeAnim.value * 0.24 }],
  }));
  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + activeAnim.value * 0.05 }, { translateY: -activeAnim.value * 1 }],
  }));
  const animatedLabelStyle = useAnimatedStyle(() => ({
    opacity: 0.58 + activeAnim.value * 0.42,
  }));

  const activeColor = isDark ? Colors.brandCyan : Colors.brandBlue;
  const inactiveColor = isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight;
  const Icon = item.icon;

  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      scaleTo={0.95}
      style={styles.navButton}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.activeIndicator,
          { backgroundColor: isDark ? 'rgba(101, 214, 192, 0.14)' : 'rgba(47, 124, 255, 0.10)' },
          animatedIndicatorStyle,
        ]}
      />
      <Animated.View style={animatedIconStyle}>
        <Icon size={20} color={active ? activeColor : inactiveColor} strokeWidth={active ? 2.35 : 1.9} />
      </Animated.View>
      <Animated.View style={animatedLabelStyle}>
        <Typography
          variant="tiny"
          color={active ? activeColor : inactiveColor}
          style={styles.navLabel}
          numberOfLines={1}
        >
          {item.label}
        </Typography>
      </Animated.View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    alignSelf: 'center',
    width: '92%',
    maxWidth: LayoutTokens.navigationMaxWidth,
    height: LayoutTokens.navigationHeight,
    zIndex: 30,
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    height: LayoutTokens.navigationHeight,
    paddingHorizontal: Spacing.xs,
    borderCurve: 'continuous',
  },
  navRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  navButton: {
    flex: 1,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    marginVertical: 5,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
  },
  navLabel: {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
});
