import React from 'react';
import { StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { CheckSquare, Sparkles, Mic, Settings } from 'lucide-react-native';
import { GlassSurface } from './GlassSurface';
import { AnimatedPressable } from './AnimatedPressable';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { useSettingsStore } from '@/stores/settings.store';
import * as Haptics from 'expo-haptics';

interface NavItem {
  key: string;
  route: string;
  label: string;
  icon: (color: string) => React.ReactNode;
}

const navItems: NavItem[] = [
  {
    key: 'home',
    route: '/',
    label: 'Home',
    icon: (color) => <CheckSquare size={20} color={color} />,
  },
  {
    key: 'ai',
    route: '/ai',
    label: 'AI Overview',
    icon: (color) => <Sparkles size={20} color={color} />,
  },
  {
    key: 'transcribe',
    route: '/transcribe',
    label: 'Transcribe',
    icon: (color) => <Mic size={20} color={color} />,
  },
  {
    key: 'settings',
    route: '/settings',
    label: 'Settings',
    icon: (color) => <Settings size={20} color={color} />,
  },
];

export const FloatingToolbar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useSettingsStore((s) => s.theme);
  const isDark = theme === 'dark' || (theme === 'system' && true);

  const handleNavigate = (route: string) => {
    if (pathname !== route) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      router.push(route as any);
    }
  };

  return (
    <View style={styles.floatingContainer}>
      <GlassSurface
        intensity={75}
        borderRadius={Radius.pill}
        style={styles.glassBar}
      >
        <View style={styles.tabRow}>
          {navItems.map((item) => {
            const isActive =
              pathname === item.route ||
              (item.route === '/' && (pathname === '' || pathname === '/index'));

            const iconColor = isActive
              ? isDark
                ? Colors.white
                : Colors.black
              : Colors.zinc500;

            return (
              <AnimatedPressable
                key={item.key}
                onPress={() => handleNavigate(item.route)}
                scaleTo={0.9}
                style={[
                  styles.tabButton,
                  isActive && {
                    backgroundColor: isDark
                      ? 'rgba(255, 255, 255, 0.12)'
                      : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
              >
                {item.icon(iconColor)}
              </AnimatedPressable>
            );
          })}
        </View>
      </GlassSurface>
    </View>
  );
};

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
    pointerEvents: 'box-none',
  },
  glassBar: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  tabButton: {
    width: 48,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
