import React, { type RefObject } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors, Radius } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';

interface AssistantMaterialProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  blurTarget?: RefObject<View | null>;
}

/** Crisp, minimal monochrome material surface for floating toolbars and panels. */
export const AssistantMaterial: React.FC<AssistantMaterialProps> = ({
  children,
  style,
  borderRadius = Radius.xl,
}) => {
  const isDark = useIsDark();

  return (
    <View
      style={[
        styles.clip,
        styles.fallback,
        {
          borderRadius,
          borderColor: isDark ? Colors.borderDark : Colors.borderLight,
          backgroundColor: isDark ? Colors.surfaceRaisedDark : Colors.surfaceRaisedLight,
        },
        style,
      ]}
    >
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  fallback: {
    borderWidth: 1,
  },
  content: {
    flex: 1,
  },
});
