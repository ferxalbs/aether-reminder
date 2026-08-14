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
  borderRadius = Radius.lg,
  width = 210,
}) => {
  const isDark = useIsDark();

  return (
    <Animated.View
      entering={FadeIn.duration(140)}
      exiting={FadeOut.duration(90)}
      style={[styles.animatedWrapper, { width }, style]}
    >
      <GlassSurface
        borderRadius={borderRadius}
        intensity={65}
        tier="A"
        style={styles.surface}
        contentStyle={[
          styles.content,
          {
            backgroundColor: isDark ? 'rgba(24, 24, 28, 0.92)' : 'rgba(252, 252, 254, 0.94)',
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
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
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

