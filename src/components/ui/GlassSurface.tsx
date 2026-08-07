import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { BlurView, BlurViewProps } from 'expo-blur';
import { Colors, Radius } from '@/theme/tokens';
import { useSettingsStore } from '@/stores/settings.store';

export interface GlassSurfaceProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: BlurViewProps['tint'];
  borderRadius?: number;
  borderWidth?: number;
}

export const GlassSurface: React.FC<GlassSurfaceProps> = ({
  children,
  style,
  intensity = 60,
  tint,
  borderRadius = Radius.lg,
  borderWidth = 1,
}) => {
  const theme = useSettingsStore((s) => s.theme);
  const isDark = theme === 'dark' || (theme === 'system' && true);

  const activeTint = tint || (isDark ? 'dark' : 'light');
  const borderColor = isDark ? Colors.glassBorderDark : Colors.glassBorderLight;
  const backgroundColor = isDark ? Colors.glassDark : Colors.glassLight;

  return (
    <View
      style={[
        styles.container,
        {
          borderRadius,
          borderWidth,
          borderColor,
          backgroundColor,
        },
        style,
      ]}
    >
      <BlurView
        tint={activeTint}
        intensity={intensity}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    boxShadow: '0px 8px 16px rgba(0, 0, 0, 0.15)',
    elevation: 6,
  },
  content: {
    zIndex: 1,
  },
});
