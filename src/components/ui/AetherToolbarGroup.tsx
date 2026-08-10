import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GlassSurface } from './GlassSurface';
import { Hairline, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';

export interface AetherToolbarGroupProps {
  children: React.ReactNode;
}

export const AetherToolbarGroup: React.FC<AetherToolbarGroupProps> = ({ children }) => {
  const isDark = useIsDark();
  const childrenArray = React.Children.toArray(children);

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.iosContainer}>
        {childrenArray.map((child, index) => (
          <React.Fragment key={index}>
            {index > 0 ? (
              <View
                style={[
                  styles.divider,
                  { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' },
                ]}
              />
            ) : null}
            {child}
          </React.Fragment>
        ))}
      </View>
    );
  }

  return (
    <GlassSurface
      borderRadius={Radius.pill}
      intensity={45}
      tier="A"
      style={styles.androidCapsule}
      contentStyle={styles.androidContent}
    >
      {childrenArray.map((child, index) => (
        <React.Fragment key={index}>
          {index > 0 ? (
            <View
              style={[
                styles.divider,
                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' },
              ]}
            />
          ) : null}
          {child}
        </React.Fragment>
      ))}
    </GlassSurface>
  );
};

const styles = StyleSheet.create({
  iosContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  androidCapsule: {
    height: 44,
  },
  androidContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
  },
  divider: {
    width: Hairline.width,
    height: 20,
  },
});
