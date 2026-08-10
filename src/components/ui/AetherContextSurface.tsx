import React from 'react';
import { StyleSheet, ViewStyle, StyleProp, DimensionValue } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { GlassSurface } from './GlassSurface';
import { Hairline, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';

export interface AetherContextSurfaceProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  borderRadius?: number;
  width?: DimensionValue;
}

export const AetherContextSurface: React.FC<AetherContextSurfaceProps> = ({
  children,
  style,
  contentStyle,
  borderRadius = Radius.xl,
  width = 220,
}) => {
  const isDark = useIsDark();

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(100)}
      style={[styles.animatedWrapper, { width }, style]}
    >
      <GlassSurface
        borderRadius={borderRadius}
        intensity={60}
        tier="A"
        style={styles.surface}
        contentStyle={[
          styles.content,
          {
            backgroundColor: isDark ? 'rgba(22, 22, 26, 0.88)' : 'rgba(250, 250, 252, 0.92)',
          },
          contentStyle,
        ]}
      >
        {children}
      </GlassSurface>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  animatedWrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 1000,
  },
  surface: {
    width: '100%',
  },
  content: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: Spacing.xs,
    borderWidth: Hairline.width,
  },
});
