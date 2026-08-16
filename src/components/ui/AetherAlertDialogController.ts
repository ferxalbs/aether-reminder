import { useCallback, useEffect, useRef } from "react";
import { reportNonFatalError } from "@/lib/nonFatalError";
import type { AetherDialogAction } from "./AetherAlertDialog.types";

export function useAetherAlertDialogController(
  visible: boolean,
  onDismiss: () => void,
) {
  const dismissedRef = useRef(false);
  const actionHandledRef = useRef(false);

  useEffect(() => {
    if (visible) {
      dismissedRef.current = false;
      actionHandledRef.current = false;
    }
  }, [visible]);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onDismiss();
  }, [onDismiss]);

  const invoke = useCallback(
    (action: AetherDialogAction) => {
      if (actionHandledRef.current) return;
      actionHandledRef.current = true;
      dismiss();

      try {
        const result = action.onPress?.();
        if (result && typeof result.then === "function") {
          void result.catch((error: unknown) => {
            reportNonFatalError("aether-alert-action", error);
          });
        }
      } catch (error) {
        reportNonFatalError("aether-alert-action", error);
      }
    },
    [dismiss],
  );

  return { dismiss, invoke };
}
