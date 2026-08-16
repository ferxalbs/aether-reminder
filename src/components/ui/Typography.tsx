import React from "react";
import { Text, TextProps } from "react-native";
import { TypographyTokens } from "@/theme/tokens";
import { useSemanticColors } from "@/theme/useSemanticColors";

export interface TypographyProps extends TextProps {
  variant?:
    "display" | "headline" | "title" | "body" | "bodyBold" | "caption" | "tiny";
  color?: string;
  align?: "auto" | "left" | "right" | "center" | "justify";
  children: React.ReactNode;
}

export const Typography: React.FC<TypographyProps> = ({
  variant = "body",
  color,
  align = "left",
  allowFontScaling = true,
  style,
  children,
  ...rest
}) => {
  const colors = useSemanticColors();
  const defaultColor = color || colors.textPrimary;
  const token = TypographyTokens[variant];

  return (
    <Text
      {...rest}
      allowFontScaling={allowFontScaling}
      selectable={rest.selectable ?? false}
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
