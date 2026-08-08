import React, { useEffect } from 'react';
import { CheckSquare, ListTodo, Settings } from 'lucide-react-native';
import { usePathname, useRouter } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring, 
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
    <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(insets.bottom, 12) + 24 }]}>
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
      <View pointerEvents="box-none" style={styles.orbContainer}>
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
    height: 144,
    zIndex: 30,
    alignItems: 'center',
    overflow: 'visible',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: Platform.OS === 'android' ? 12 : 0,
  },
  bar: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: 68,
    paddingHorizontal: Spacing.xs,
    overflow: 'visible',
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
    paddingRight: 28,
  },
  rightGroup: {
    flex: 1,
    alignItems: 'center',
    paddingLeft: 28,
  },
  centerGap: {
    width: 72,
  },
  navButton: {
    minWidth: 64,
    height: 60,
    paddingHorizontal: Spacing.sm,
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
    bottom: 76,
    left: '50%',
    marginLeft: -38,
    zIndex: 2,
  },
});
