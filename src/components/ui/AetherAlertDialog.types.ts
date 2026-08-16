export type AetherDialogActionRole = "default" | "cancel" | "destructive";

export type AetherDialogAction = {
  label: string;
  role?: AetherDialogActionRole;
  onPress?: () => void | Promise<void>;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Android's native Material 3 AlertDialog exposes one confirm and one dismiss
 * action slot. Application dialogs should therefore provide one or two
 * semantic actions; a cancel-role action is mapped to the dismiss slot.
 */
export type AetherDialogActions = readonly AetherDialogAction[];

export type AetherAlertDialogProps = {
  visible: boolean;
  title: string;
  message?: string;
  actions: AetherDialogActions;
  onDismiss: () => void;
  dismissOnBackPress?: boolean;
  dismissOnClickOutside?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

export type AetherAlertDialogState = Omit<
  AetherAlertDialogProps,
  "visible" | "onDismiss"
>;

export function splitAetherDialogActions(actions: AetherDialogActions): {
  confirm?: AetherDialogAction;
  dismiss?: AetherDialogAction;
} {
  const cancel = actions.find((action) => action.role === "cancel");
  const confirm =
    actions.find((action) => action !== cancel && action.role !== "cancel") ??
    actions.find((action) => action !== cancel);
  const dismiss = cancel ?? actions.find((action) => action !== confirm);

  return { confirm, dismiss };
}
