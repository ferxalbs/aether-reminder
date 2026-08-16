import React from "react";
import { Host } from "@expo/ui";
import { Alert, Button, Text } from "@expo/ui/swift-ui";
import { opacity } from "@expo/ui/swift-ui/modifiers";
import { useAetherTheme } from "@/theme/useAetherTheme";
import { useAetherAlertDialogController } from "./AetherAlertDialogController";
import {
  splitAetherDialogActions,
  type AetherAlertDialogProps,
  type AetherDialogAction,
} from "./AetherAlertDialog.types";

function toSwiftUIButtonRole(action: AetherDialogAction) {
  return action.role === "destructive" || action.role === "cancel"
    ? action.role
    : "default";
}

export function AetherAlertDialog({
  visible,
  title,
  message,
  actions,
  onDismiss,
  accessibilityLabel,
  testID,
}: AetherAlertDialogProps): React.ReactElement | null {
  const theme = useAetherTheme();
  const { confirm, dismiss: dismissAction } = splitAetherDialogActions(actions);
  const controller = useAetherAlertDialogController(visible, onDismiss);

  if (!visible || !confirm) return null;

  return (
    <Host matchContents colorScheme={theme.mode} testID={testID}>
      <Alert
        title={title}
        isPresented={visible}
        testID={testID}
        onIsPresentedChange={(isPresented) => {
          if (!isPresented) controller.dismiss();
        }}
      >
        <Alert.Trigger>
          <Text
            modifiers={[opacity(0)]}
            testID={testID ? `${testID}-trigger` : undefined}
          >
            {accessibilityLabel ?? title}
          </Text>
        </Alert.Trigger>
        {message ? (
          <Alert.Message>
            <Text>{message}</Text>
          </Alert.Message>
        ) : null}
        <Alert.Actions>
          <Button
            label={confirm.label}
            role={toSwiftUIButtonRole(confirm)}
            onPress={() => controller.invoke(confirm)}
            testID={confirm.testID}
          />
          {dismissAction ? (
            <Button
              label={dismissAction.label}
              role={toSwiftUIButtonRole(dismissAction)}
              onPress={() => controller.invoke(dismissAction)}
              testID={dismissAction.testID}
            />
          ) : null}
        </Alert.Actions>
      </Alert>
    </Host>
  );
}
