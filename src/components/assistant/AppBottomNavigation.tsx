import React from 'react';
import { CheckSquare, ListTodo, Settings } from 'lucide-react-native';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { Typography } from '@/components/ui/Typography';
import { AssistantMaterial } from './AssistantMaterial';
import { AssistantOrb } from './AssistantOrb';
import type { AssistantOrbState } from './assistantTypes';

interface AppBottomNavigationProps {
  orbState: AssistantOrbState;
  assistantExpanded: boolean;
  onOrbPress: () => void;
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
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isDark = useIsDark();

  const navigate = (destination: Destination) => {
    const isHome = destination === '/' && (pathname === '/' || pathname === '/index');
    if (pathname === destination || isHome) return;
    router.replace(destination as never);
  };

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + Spacing.sm }]}>
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
        <AssistantOrb state={orbState} expanded={assistantExpanded} onPress={onOrbPress} />
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
  const color = active ? (isDark ? Colors.white : Colors.black) : Colors.zinc500;
  const Icon = item.icon;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
    >
      <Icon size={19} color={color} strokeWidth={active ? 2.4 : 2} />
      <Typography variant="tiny" color={color} style={styles.navLabel}>
        {item.label}
      </Typography>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    height: 70,
    zIndex: 30,
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    height: 70,
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
    justifyContent: 'space-around',
    paddingRight: 18,
  },
  rightGroup: {
    flex: 1,
    alignItems: 'center',
    paddingLeft: 18,
  },
  centerGap: {
    width: 72,
  },
  navButton: {
    minWidth: 60,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  navLabel: {
    fontSize: 10,
    lineHeight: 13,
  },
  orbContainer: {
    position: 'absolute',
    top: -24,
    left: '50%',
    marginLeft: -36,
  },
  pressed: {
    opacity: 0.65,
  },
});
