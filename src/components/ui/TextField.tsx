import React, { useState } from "react";
import {
  Platform,
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import {
  ControlTokens,
  getMinimumTouchTarget,
  TypographyTokens,
} from "@/theme/tokens";
import { useAetherTheme } from "@/theme/useAetherTheme";
import { GlassSurface } from "./GlassSurface";
import { Typography } from "./Typography";

export interface TextFieldProps extends Omit<
  TextInputProps,
  | "accessibilityLabel"
  | "accessibilityRole"
  | "accessibilityState"
  | "onBlur"
  | "onFocus"
  | "placeholderTextColor"
  | "style"
> {
  label: string;
  helperText?: string;
  error?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  variant?: "filled" | "outline" | "glass";
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  onBlur?: TextInputProps["onBlur"];
  onFocus?: TextInputProps["onFocus"];
}

export const TextField: React.FC<TextFieldProps> = ({
  label,
  helperText,
  error,
  leading,
  trailing,
  variant = "filled",
  containerStyle,
  inputStyle,
  accessibilityLabel,
  accessibilityHint,
  editable = true,
  multiline = false,
  onBlur,
  onFocus,
  ...inputProps
}) => {
  const theme = useAetherTheme();
  const { colors } = theme;
  const fieldTokens = theme.components.field;
  const [focused, setFocused] = useState(false);
  const isDisabled = editable === false;
  const hasError = Boolean(error);

  const borderColor = hasError
    ? fieldTokens.borderError
    : focused
      ? fieldTokens.borderFocused
      : fieldTokens.border;

  const backgroundColor =
    variant === "filled" ? fieldTokens.background : "transparent";

  const textColor = fieldTokens.text;
  const placeholderColor = fieldTokens.placeholder;
  const fieldRadius = theme.shape.field;

  const handleFocus: NonNullable<TextInputProps["onFocus"]> = (event) => {
    setFocused(true);
    onFocus?.(event);
  };

  const handleBlur: NonNullable<TextInputProps["onBlur"]> = (event) => {
    setFocused(false);
    onBlur?.(event);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <Typography
        variant="caption"
        color={colors.textSecondary}
        accessible={false}
      >
        {label}
      </Typography>
      <View
        style={[
          styles.fieldShell,
          {
            backgroundColor,
            borderColor,
            borderRadius: fieldRadius,
          },
          multiline && styles.multilineShell,
          isDisabled && styles.disabled,
        ]}
      >
        {variant === "glass" ? (
          <GlassSurface
            pointerEvents="none"
            borderRadius={fieldRadius}
            borderWidth={0}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {leading ? (
          <View style={styles.leading} pointerEvents="none">
            {leading}
          </View>
        ) : null}
        <TextInput
          {...inputProps}
          accessibilityRole="text"
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={accessibilityHint}
          accessibilityState={{ disabled: isDisabled }}
          editable={editable}
          multiline={multiline}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholderTextColor={placeholderColor}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          style={[
            styles.input,
            { color: textColor },
            multiline && styles.multilineInput,
            inputStyle,
          ]}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      {error ? (
        <Typography
          variant="caption"
          color={colors.destructive}
          style={styles.message}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Typography>
      ) : helperText ? (
        <Typography
          variant="caption"
          color={colors.textTertiary}
          style={styles.message}
        >
          {helperText}
        </Typography>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: ControlTokens.fieldLabelGap,
  },
  fieldShell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: getMinimumTouchTarget(Platform.OS),
    paddingHorizontal: ControlTokens.fieldPaddingHorizontal,
    borderWidth: ControlTokens.borderWidth,
    overflow: "hidden",
  },
  multilineShell: {
    alignItems: "flex-start",
    paddingVertical: ControlTokens.fieldPaddingVertical,
  },
  input: {
    flex: 1,
    minHeight:
      getMinimumTouchTarget(Platform.OS) - ControlTokens.borderWidth * 2,
    paddingVertical: ControlTokens.fieldPaddingVertical,
    paddingHorizontal: 0,
    fontSize: TypographyTokens.body.fontSize,
    lineHeight: TypographyTokens.body.lineHeight,
    letterSpacing: TypographyTokens.body.letterSpacing,
  },
  multilineInput: {
    textAlignVertical: "top",
  },
  leading: {
    width: ControlTokens.fieldIconSize,
    height: ControlTokens.fieldIconSize,
    marginRight: ControlTokens.fieldContentGap,
    alignItems: "center",
    justifyContent: "center",
  },
  trailing: {
    marginLeft: ControlTokens.fieldContentGap,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    marginTop: ControlTokens.fieldMessageGap,
  },
  disabled: {
    opacity: ControlTokens.disabledOpacity,
  },
});
