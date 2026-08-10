import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { CalendarDays, ListTodo, PenLine, Settings } from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Typography } from '@/components/ui/Typography';
import { LayoutTokens, Motion, Radius, Spacing } from '@/theme/tokens';
import { useSemanticColors } from '@/theme/useSemanticColors';

type Destination = '/' | '/tasks' | '/all' | '/settings';

const navigationItems = [
  { destination: '/' as const, label: 'Compose', icon: PenLine },
  { destination: '/tasks' as const, label: 'Upcoming', icon: CalendarDays },
  { destination: '/all' as const, label: 'All', icon: ListTodo },
  { destination: '/settings' as const, label: 'Settings', icon: Settings },
];

export function AppBottomNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const colors = useSemanticColors();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (keyboardVisible) return null;

  const isActive = (destination: Destination) =>
    pathname === destination || (destination === '/' && pathname === '/index');

  return (
    <View
      style={[
        styles.host,
        {
          paddingBottom: insets.bottom,
          backgroundColor: colors.surface,
          borderTopColor: colors.separator,
        },
      ]}
    >
      <View style={styles.navigation} accessibilityRole="tablist">
        {navigationItems.map((item) => (
          <NavigationButton
            key={item.destination}
            item={item}
            active={isActive(item.destination)}
            onPress={() => {
              if (!isActive(item.destination)) router.navigate(item.destination);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function NavigationButton({
  item,
  active,
  onPress,
}: {
  item: (typeof navigationItems)[number];
  active: boolean;
  onPress: () => void;
}) {
  const colors = useSemanticColors();
  const reduceMotion = useReducedMotion();
  const selected = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    selected.value = reduceMotion
      ? active ? 1 : 0
      : withSpring(active ? 1 : 0, Motion.pressSpring);
  }, [active, reduceMotion, selected]);

  const indicatorStyle = useAnimatedStyle(() => ({ opacity: selected.value }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reduceMotion ? 0 : -selected.value }],
  }));
  const Icon = item.icon;

  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      scaleTo={Motion.pressScale}
      style={styles.item}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.selected,
          { backgroundColor: colors.selected },
          indicatorStyle,
        ]}
      />
      <Animated.View style={iconStyle}>
        <Icon
          size={19}
          color={active ? colors.textPrimary : colors.textSecondary}
          strokeWidth={active ? 2.35 : 1.9}
        />
      </Animated.View>
      <Typography
        variant="tiny"
        color={active ? colors.textPrimary : colors.textSecondary}
        style={styles.label}
        numberOfLines={1}
      >
        {item.label}
      </Typography>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  host: {
    borderTopWidth: 1,
  },
  navigation: {
    width: '100%',
    maxWidth: LayoutTokens.navigationMaxWidth,
    height: LayoutTokens.navigationHeight,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
  },
  item: {
    flex: 1,
    height: 52,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  selected: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    marginHorizontal: Spacing.xs,
    marginVertical: 3,
    borderRadius: Radius.md,
  },
  label: {
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
  },
});
