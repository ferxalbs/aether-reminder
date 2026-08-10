import React, { type RefObject, useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { CalendarDays, CheckCircle2, ListTodo, Settings } from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Typography } from '@/components/ui/Typography';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { LayoutTokens, Motion, Radius, Spacing } from '@/theme/tokens';
import { useSemanticColors } from '@/theme/useSemanticColors';
import { useIsDark } from '@/theme/useResolvedTheme';
import { useBottomChromeGeometry } from '@/theme/useBottomChromeGeometry';
import { useAssistantActive } from './AssistantHost';

type Destination = '/' | '/tasks' | '/all' | '/settings';

const navigationItems = [
  { destination: '/' as const, label: 'Today', icon: CheckCircle2 },
  { destination: '/tasks' as const, label: 'Schedule', icon: CalendarDays },
  { destination: '/all' as const, label: 'Reminders', icon: ListTodo },
  { destination: '/settings' as const, label: 'Settings', icon: Settings },
];

interface AppBottomNavigationProps {
  blurTarget?: RefObject<View | null>;
}

export function AppBottomNavigation({ blurTarget }: AppBottomNavigationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isDark = useIsDark();
  const geometry = useBottomChromeGeometry();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const assistantActive = useAssistantActive();

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

  if (keyboardVisible || assistantActive) return null;

  const isActive = (destination: Destination) =>
    pathname === destination || (destination === '/' && pathname === '/index');

  return (
    <View style={[styles.host, { bottom: geometry.navigationBottom }]} pointerEvents="box-none">
      <GlassSurface
        blurTarget={blurTarget}
        borderRadius={Radius.pill}
        intensity={Platform.OS === 'ios' ? 65 : 45}
        tier={Platform.OS === 'android' ? 'A' : undefined}
        style={styles.capsule}
        contentStyle={styles.navigation}
        accessible
        accessibilityRole="tablist"
      >
        {navigationItems.map((item) => (
          <NavigationButton
            key={item.destination}
            item={item}
            active={isActive(item.destination)}
            isDark={isDark}
            onPress={() => {
              if (!isActive(item.destination)) router.navigate(item.destination);
            }}
          />
        ))}
      </GlassSurface>
    </View>
  );
}

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
  const colors = useSemanticColors();
  const reduceMotion = useReducedMotion();
  const selected = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    selected.value = reduceMotion
      ? active ? 1 : 0
      : withSpring(active ? 1 : 0, Motion.pressSpring);
  }, [active, reduceMotion, selected]);

  const indicatorStyle = useAnimatedStyle(() => ({ opacity: selected.value }));
  const Icon = item.icon;

  const highlightBg = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.07)';

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
          { backgroundColor: highlightBg },
          indicatorStyle,
        ]}
      />
      <Icon
        size={19}
        color={active ? colors.textPrimary : colors.textSecondary}
        strokeWidth={active ? 2.3 : 1.8}
      />
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
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 100,
  },
  capsule: {
    width: '100%',
    maxWidth: LayoutTokens.navigationMaxWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  navigation: {
    width: '100%',
    height: LayoutTokens.navigationHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.xs,
  },
  item: {
    flex: 1,
    height: 48,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  selected: {
    position: 'absolute',
    top: 4,
    right: 4,
    bottom: 4,
    left: 4,
    borderRadius: Radius.pill,
  },
  label: {
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
});
