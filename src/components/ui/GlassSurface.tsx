import React, { createContext, useContext, type RefObject } from 'react';
import { StyleSheet, View, ViewProps, ViewStyle, StyleProp } from 'react-native';
import type { BlurViewProps } from 'expo-blur';
import { Colors, Radius } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';

export interface GlassSurfaceProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: BlurViewProps['tint'];
  borderRadius?: number;
  borderWidth?: number;
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: ViewProps['accessibilityRole'];
  pointerEvents?: ViewProps['pointerEvents'];
  blurTarget?: RefObject<View | null>;
}

const GlassBlurTargetContext = createContext<RefObject<View | null> | undefined>(undefined);

export const GlassSurfaceProvider: React.FC<
  React.PropsWithChildren<{ blurTarget: RefObject<View | null> }>
> = ({ blurTarget, children }) => (
  <GlassBlurTargetContext.Provider value={blurTarget}>
    {children}
  </GlassBlurTargetContext.Provider>
);

export const GlassSurface: React.FC<GlassSurfaceProps> = ({
  children,
  style,
  contentStyle,
  intensity = 50,
  tint,
  borderRadius = Radius.lg,
  borderWidth = 1,
  accessible,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  pointerEvents,
  blurTarget,
}) => {
  const isDark = useIsDark();
  useContext(GlassBlurTargetContext);
  const borderColor = isDark ? Colors.borderDark : Colors.borderLight;
  const backgroundColor = isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight;

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
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
      pointerEvents={pointerEvents}
    >
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  content: {
  },
});
