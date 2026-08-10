import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Colors } from '@/theme/tokens';

interface AetherMarkProps {
  size?: number;
  muted?: boolean;
}

/** A small, asset-free AETHER mark that stays crisp at every density. */
export const AetherMark: React.FC<AetherMarkProps> = ({ size = 32, muted = false }) => {
  const ringColor = muted ? Colors.tertiaryTextLight : Colors.black;
  const darkRingColor = muted ? Colors.tertiaryTextDark : Colors.white;

  return (
    <View
      accessible={false}
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: ringColor,
          boxShadow: `0 3px ${Math.max(8, Math.round(size * 0.45))}px rgba(255, 255, 255, 0.15)`,
        },
      ]}
    >
      <View
        style={[
          styles.innerRing,
          {
            width: size * 0.55,
            height: size * 0.55,
            borderRadius: size,
            borderColor: darkRingColor,
          },
        ]}
      />
      <View
        style={[
          styles.core,
          {
            width: size * 0.19,
            height: size * 0.19,
            borderRadius: size,
            backgroundColor: muted ? Colors.tertiaryTextDark : Colors.white,
          },
        ]}
      />
      <View
        style={[
          styles.highlight,
          {
            width: size * 0.27,
            height: size * 0.12,
            borderRadius: size,
            backgroundColor: 'rgba(255,255,255,0.86)',
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandInk,
    borderWidth: 1.2,
    borderCurve: 'continuous',
  },
  innerRing: {
    borderWidth: 1.4,
    opacity: 0.9,
  },
  core: {
    position: 'absolute',
    right: '22%',
    bottom: '21%',
  },
  highlight: {
    position: 'absolute',
    top: '21%',
    left: '22%',
    transform: [{ rotate: '-28deg' }],
    opacity: 0.92,
  },
});
