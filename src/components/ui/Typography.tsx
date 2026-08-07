import React from 'react';
import { Text, TextProps } from 'react-native';
import { Colors, TypographyTokens } from '@/theme/tokens';
import { useSettingsStore } from '@/stores/settings.store';

export interface TypographyProps extends TextProps {
  variant?: 'display' | 'headline' | 'title' | 'body' | 'bodyBold' | 'caption' | 'tiny';
  color?: string;
  align?: 'auto' | 'left' | 'right' | 'center' | 'justify';
  children: React.ReactNode;
}

export const Typography: React.FC<TypographyProps> = ({
  variant = 'body',
  color,
  align = 'left',
  style,
  children,
  ...rest
}) => {
  const theme = useSettingsStore((s) => s.theme);
  const isDark = theme === 'dark' || (theme === 'system' && true);

  const defaultColor = color || (isDark ? Colors.white : Colors.zinc950);
  const token = TypographyTokens[variant];

  return (
    <Text
      {...rest}
      style={[
        {
          fontSize: token.fontSize,
          lineHeight: token.lineHeight,
          letterSpacing: token.letterSpacing,
          fontWeight: token.fontWeight,
          color: defaultColor,
          textAlign: align,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
};
