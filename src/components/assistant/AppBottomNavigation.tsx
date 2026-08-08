import React, { useEffect } from 'react';
import { CheckSquare, ListTodo, Settings } from 'lucide-react-native';
import { usePathname, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring, 
  interpolateColor
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { AssistantMaterial } from './AssistantMaterial';
import { AssistantOrb } from './AssistantOrb';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import type { AssistantOrbState } from './assistantTypes';

interface AppBottomNavigationProps {
  orbState: AssistantOrbState;
  assistantExpanded: boolean;
  onOrbPress: () => void;
  onOrbPressIn?: () => void;
  onOrbPressOut?: () => void;
  onOrbPressMove?: (event: { nativeEvent: { pageY: number } }) => void;
}

type Destination = '/' | '/tasks' | '/settings';

const navigationItems: { destination: Destination; label: string; icon: typeof CheckSquare }[] = [
  { destination: '/', label: 'Home', icon: CheckSquare },
  { destination: '/tasks', label: 'Tasks', icon: ListTodo },
  { destination: '/settings', label: 'Settings', icon: Settings },
];

export const AppBottomNavigation: React.FC<AppBottomNavigationProps> = ({
  orbState,
  assistantExpanded,
  onOrbPress,
  onOrbPressIn,
  onOrbPressOut,
  onOrbPressMove,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isDark = useIsDark();

  const navigate = (destination: Destination) => {
    const isHome = destination === '/' && (pathname === '/' || pathname === '/index');
    if (pathname === destination || isHome) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.replace(destination as never);
  };

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 12 }]}>
      <AssistantMaterial style={styles.bar} borderRadius={Radius.pill}>
        <View style={styles.navRow}>
          <View style={styles.leftGroup}>
            {navigationItems.slice(0, 2).map((item) => (
              <NavigationButton
                key={item.destination}
                item={item}
                active={pathname === item.destination || (item.destination === '/' && pathname === '/index')}
                isDark={isDark}
                onPress={() => navigate(item.destination)}
              />
            ))}
          </View>
          <View style={styles.centerGap} />
          <View style={styles.rightGroup}>
            <NavigationButton
              item={navigationItems[2]}
              active={pathname === '/settings'}
              isDark={isDark}
              onPress={() => navigate('/settings')}
            />
          </View>
        </View>
      </AssistantMaterial>
      <View style={styles.orbContainer}>
        <AssistantOrb 
          state={orbState} 
          expanded={assistantExpanded} 
          onPress={onOrbPress} 
          onPressIn={onOrbPressIn} 
          onPressOut={onOrbPressOut} 
          onPressMove={onOrbPressMove} 
        />
      </View>
    </View>
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
      damping: 18,
      stiffness: 200,
      mass: 0.8,
    });
  }, [active, activeAnim]);

  const animatedIconStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: 1 + activeAnim.value * 0.15 },
        { translateY: -activeAnim.value * 2 }
      ],
    };
  });

  const animatedLabelStyle = useAnimatedStyle(() => {
    return {
      opacity: activeAnim.value,
      transform: [
        { translateY: (1 - activeAnim.value) * 6 }
      ],
    };
  });

  const activeColor = isDark ? Colors.white : Colors.black;
  const inactiveColor = Colors.zinc500;
  const Icon = item.icon;

  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      scaleTo={0.88}
      style={styles.navButton}
    >
      <View style={styles.iconContainer}>
        <Animated.View style={animatedIconStyle}>
          <Icon 
            size={22} 
            color={active ? activeColor : inactiveColor} 
            strokeWidth={active ? 2.5 : 2} 
          />
        </Animated.View>
        
        {/* Animated Active Dot or Label */}
        <Animated.View style={[styles.labelContainer, animatedLabelStyle]}>
          <Typography 
            variant="tiny" 
            style={[
              styles.navLabel, 
              { color: activeColor, fontWeight: '700' }
            ]}
          >
            {item.label}
          </Typography>
        </Animated.View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    height: 72,
    zIndex: 30,
    alignItems: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  bar: {
    width: '100%',
    height: 72,
    paddingHorizontal: Spacing.sm,
  },
  navRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftGroup: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingRight: 24,
  },
  rightGroup: {
    flex: 1,
    alignItems: 'center',
    paddingLeft: 24,
  },
  centerGap: {
    width: 76,
  },
  navButton: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
  labelContainer: {
    position: 'absolute',
    bottom: -8,
  },
  navLabel: {
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.3,
  },
  orbContainer: {
    position: 'absolute',
    top: -24,
    left: '50%',
    marginLeft: -38,
  },
});
