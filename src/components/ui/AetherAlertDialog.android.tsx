import React from "react";
import { Host } from "@expo/ui";
import {
  AlertDialog,
  Text,
  TextButton,
} from "@expo/ui/jetpack-compose";
import { testID as composeTestID } from "@expo/ui/jetpack-compose/modifiers";
import { useAetherTheme } from "@/theme/useAetherTheme";
import { useAetherAlertDialogController } from "./AetherAlertDialogController";
import {
  splitAetherDialogActions,
  type AetherAlertDialogProps,
  type AetherDialogAction,
} from "./AetherAlertDialog.types";

function actionColor(
  action: AetherDialogAction,
  colors: ReturnType<typeof useAetherTheme>["colors"],
) {
  return action.role === "destructive" ? colors.destructive : colors.interactive;
}

export function AetherAlertDialog({
  visible,
  title,
  message,
  actions,
  onDismiss,
  dismissOnBackPress = true,
  dismissOnClickOutside = true,
  accessibilityLabel,
  testID,
}: AetherAlertDialogProps): React.ReactElement | null {
  const theme = useAetherTheme();
  const { colors } = theme;
  const { confirm, dismiss: dismissAction } =
    splitAetherDialogActions(actions);
  const controller = useAetherAlertDialogController(visible, onDismiss);

  if (!visible || !confirm) return null;

  const confirmColor = actionColor(confirm, colors);
  const dismissColor = dismissAction
    ? actionColor(dismissAction, colors)
    : colors.interactive;
  const fallbackSeedColor = theme.source === "material-you" ? undefined : colors.accent;

  return (
    <Host
      matchContents
      colorScheme={theme.mode}
      seedColor={fallbackSeedColor}
      accessibilityLabel={accessibilityLabel ?? title}
      testID={testID}
    >
      <AlertDialog
        onDismissRequest={controller.dismiss}
        colors={{
          containerColor: colors.surfaceElevated,
          titleContentColor: colors.textPrimary,
          textContentColor: colors.textSecondary,
        }}
        properties={{
          dismissOnBackPress,
          dismissOnClickOutside,
          usePlatformDefaultWidth: true,
          decorFitsSystemWindows: true,
        }}
        modifiers={testID ? [composeTestID(testID)] : undefined}
      >
        <AlertDialog.Title>
          <Text color={colors.textPrimary} style={{ typography: "headlineSmall" }}>
            {title}
          </Text>
        </AlertDialog.Title>
        {message ? (
          <AlertDialog.Text>
            <Text color={colors.textSecondary} style={{ typography: "bodyMedium" }}>
              {message}
            </Text>
          </AlertDialog.Text>
        ) : null}
        <AlertDialog.ConfirmButton>
          <TextButton
            onClick={() => controller.invoke(confirm)}
            colors={{ contentColor: confirmColor }}
            modifiers={
              confirm.testID ? [composeTestID(confirm.testID)] : undefined
            }
          >
            <Text color={confirmColor} style={{ typography: "labelLarge" }}>
              {confirm.label}
            </Text>
          </TextButton>
        </AlertDialog.ConfirmButton>
        {dismissAction ? (
          <AlertDialog.DismissButton>
            <TextButton
              onClick={() => controller.invoke(dismissAction)}
              colors={{ contentColor: dismissColor }}
              modifiers={
                dismissAction.testID
                  ? [composeTestID(dismissAction.testID)]
                  : undefined
              }
            >
              <Text color={dismissColor} style={{ typography: "labelLarge" }}>
                {dismissAction.label}
              </Text>
            </TextButton>
          </AlertDialog.DismissButton>
        ) : null}
      </AlertDialog>
    </Host>
  );
}
