import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Typography } from '@/components/ui/Typography';
import { Colors, Radius } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { usePathname, useRouter } from 'expo-router';
import { Brain, ListTodo, Mic, PenLine, Settings } from 'lucide-react-native';
import React, { useEffect, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AssistantMaterial } from './AssistantMaterial';
import { AssistantOrb } from './AssistantOrb';
import type { AssistantOrbState } from './assistantTypes';

interface AppBottomNavigationProps {
  orbState: AssistantOrbState;
  assistantExpanded: boolean;
  audioLevel?: SharedValue<number>;
  keyboardOffset: number;
  blurTarget?: RefObject<View | null>;
  onOrbPress: () => void;
  onOrbPressIn?: () => void;
  onOrbLongPress?: () => void;
  onOrbPressOut?: () => void;
  onOrbPressMove?: (event: { nativeEvent: { pageY: number } }) => void;
}

type Destination = '/' | '/tasks' | '/ai' | '/transcribe' | '/settings';

const navigationItems: {
  key: string;
  destination: Destination;
  label: string;
  icon: typeof PenLine;
  assistant?: boolean;
}[] = [
  { key: 'home', destination: '/', label: 'Compose', icon: PenLine },
  { key: 'tasks', destination: '/tasks', label: 'Upcoming', icon: ListTodo },
  { key: 'assistant', destination: '/ai', label: 'AETHER', icon: Brain, assistant: true },
  { key: 'voice', destination: '/transcribe', label: 'Voice', icon: Mic },
  { key: 'settings', destination: '/settings', label: 'Settings', icon: Settings },
];

export const AppBottomNavigation: React.FC<AppBottomNavigationProps> = ({
  orbState,
  assistantExpanded,
  audioLevel,
  keyboardOffset,
  blurTarget,
  onOrbPress,
  onOrbPressIn,
  onOrbLongPress,
  onOrbPressOut,
  onOrbPressMove,
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
              onPress={item.assistant ? onOrbPress : () => navigate(item.destination)}
              orbState={orbState}
              assistantExpanded={assistantExpanded}
              onOrbPressIn={onOrbPressIn}
              onOrbLongPress={onOrbLongPress}
              onOrbPressOut={onOrbPressOut}
              onOrbPressMove={onOrbPressMove}
              audioLevel={audioLevel}
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
  orbState,
  assistantExpanded,
  onOrbPressIn,
  onOrbLongPress,
  onOrbPressOut,
  onOrbPressMove,
  audioLevel,
}: {
  item: (typeof navigationItems)[number];
  active: boolean;
  isDark: boolean;
  onPress: () => void;
  orbState: AssistantOrbState;
  assistantExpanded: boolean;
  onOrbPressIn?: () => void;
  onOrbLongPress?: () => void;
  onOrbPressOut?: () => void;
  onOrbPressMove?: (event: { nativeEvent: { pageY: number } }) => void;
  audioLevel?: SharedValue<number>;
}) {
  const activeAnim = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    activeAnim.value = withSpring(active ? 1 : 0, {
      damping: 18,
      stiffness: 220,
      mass: 0.8,
    });
  }, [active, activeAnim]);

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + activeAnim.value * 0.08 }, { translateY: -activeAnim.value * 1 }],
  }));
  const animatedLabelStyle = useAnimatedStyle(() => ({
    opacity: 0.66 + activeAnim.value * 0.34,
  }));

  const activeColor = isDark ? Colors.white : Colors.black;
  const inactiveColor = Colors.zinc500;
  const Icon = item.icon;

  if (item.assistant) {
    return (
      <View style={styles.navButton} accessible accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: active }}>
        <View style={styles.assistantButtonContent}>
          <AssistantOrb
            state={orbState}
            expanded={assistantExpanded}
            size="dock"
            onPress={onPress}
            onPressIn={onOrbPressIn}
            onLongPress={onOrbLongPress}
            onPressOut={onOrbPressOut}
            onPressMove={onOrbPressMove}
            audioLevel={audioLevel}
          />
          <Typography variant="tiny" color={activeColor} numberOfLines={1} style={styles.navLabel}>
            AETHER
          </Typography>
        </View>
      </View>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      scaleTo={0.9}
      style={styles.navButton}
    >
      <Animated.View style={animatedIconStyle}>
        <Icon size={20} color={active ? activeColor : inactiveColor} strokeWidth={active ? 2.4 : 1.9} />
      </Animated.View>
      <Animated.View style={animatedLabelStyle}>
        <Typography variant="tiny" color={active ? activeColor : inactiveColor} style={styles.navLabel}>
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
    maxWidth: 640,
    height: 80,
    zIndex: 30,
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    height: 80,
    paddingHorizontal: 6,
    borderCurve: 'continuous',
  },
  navRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  navButton: {
    flex: 1,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  assistantButtonContent: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
  },
  navLabel: {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
});
