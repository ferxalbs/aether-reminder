import type React from "react";
import type { AetherAlertDialogProps } from "./AetherAlertDialog.types";

/**
 * Metro resolves the Android and Apple implementations for supported mobile
 * targets. This base is only for static module resolution; unsupported targets
 * do not have an AETHER alert implementation.
 */
export function AetherAlertDialog(
  _props: AetherAlertDialogProps,
): React.ReactElement | null {
  throw new Error("AetherAlertDialog requires a supported mobile platform.");
}

export type {
  AetherAlertDialogProps,
  AetherAlertDialogState,
  AetherDialogAction,
  AetherDialogActionRole,
  AetherDialogActions,
} from "./AetherAlertDialog.types";
