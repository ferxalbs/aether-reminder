import { describe, expect, mock, test } from "bun:test";
import React from "react";
import { useAetherAlertDialogController } from "./AetherAlertDialogController";
import {
  splitAetherDialogActions,
  type AetherDialogActions,
} from "./AetherAlertDialog.types";

type DialogContractProps = {
  title: string;
  message?: string;
  confirmLabel?: string;
  dismissLabel?: string;
  onConfirm?: () => void;
  onDismissAction?: () => void;
  onDismissRequest: () => void;
};

function DialogContract({
  title,
  message,
  actions,
  onDismiss,
}: {
  title: string;
  message?: string;
  actions: AetherDialogActions;
  onDismiss: () => void;
}) {
  const controller = useAetherAlertDialogController(true, onDismiss);
  const { confirm, dismiss } = splitAetherDialogActions(actions);

  return React.createElement("AetherDialogContract", {
    title,
    message,
    confirmLabel: confirm?.label,
    dismissLabel: dismiss?.label,
    onConfirm: confirm ? () => controller.invoke(confirm) : undefined,
    onDismissAction: dismiss ? () => controller.invoke(dismiss) : undefined,
    onDismissRequest: controller.dismiss,
  } satisfies DialogContractProps);
}

const ReactTestRenderer = (await import("react-test-renderer")).default;
const { act } = await import("react-test-renderer");

function renderDialog(
  props: Partial<React.ComponentProps<typeof DialogContract>> = {},
) {
  const onDismiss = mock(() => {});
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

  act(() => {
    renderer = ReactTestRenderer.create(
      <DialogContract
        title="API Key Required"
        message="Save an OpenAI key or enter one to test."
        actions={[{ label: "OK" }]}
        onDismiss={onDismiss}
        {...props}
      />,
    );
  });

  return { onDismiss, renderer: renderer! };
}

describe("AetherAlertDialog semantic controller", () => {
  test("preserves informational title, supporting text, OK, and dismiss", () => {
    const { renderer, onDismiss } = renderDialog();
    const contract = renderer.root.findByType("AetherDialogContract");

    expect(contract.props.title).toBe("API Key Required");
    expect(contract.props.message).toBe(
      "Save an OpenAI key or enter one to test.",
    );
    expect(contract.props.confirmLabel).toBe("OK");
    expect(contract.props.dismissLabel).toBeUndefined();

    act(() => {
      contract.props.onDismissRequest();
      contract.props.onDismissRequest();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("preserves confirmation confirm and cancel actions", () => {
    const onCancel = mock(() => {});
    const onConfirm = mock(() => {});
    const { renderer, onDismiss } = renderDialog({
      title: "Delete API Key?",
      message: "This disables realtime transcription.",
      actions: [
        { label: "Cancel", role: "cancel", onPress: onCancel },
        { label: "Delete Key", role: "destructive", onPress: onConfirm },
      ],
    });
    const contract = renderer.root.findByType("AetherDialogContract");

    expect(contract.props.confirmLabel).toBe("Delete Key");
    expect(contract.props.dismissLabel).toBe("Cancel");
    act(() => contract.props.onConfirm());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(0);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    const cancelDialog = renderDialog({
      actions: [
        { label: "Cancel", role: "cancel", onPress: onCancel },
        { label: "Delete Key", role: "destructive", onPress: onConfirm },
      ],
    });
    const cancelContract = cancelDialog.renderer.root.findByType(
      "AetherDialogContract",
    );
    act(() => cancelContract.props.onDismissAction());
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(cancelDialog.onDismiss).toHaveBeenCalledTimes(1);
  });

  test("invokes a destructive callback exactly once", () => {
    const onConfirm = mock(() => {});
    const { renderer, onDismiss } = renderDialog({
      actions: [{ label: "Reset learning", role: "destructive", onPress: onConfirm }],
    });
    const contract = renderer.root.findByType("AetherDialogContract");

    act(() => {
      contract.props.onConfirm();
      contract.props.onConfirm();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("maps external and back dismissal through the same callback", () => {
    const { renderer, onDismiss } = renderDialog();
    const contract = renderer.root.findByType("AetherDialogContract");

    act(() => {
      contract.props.onDismissRequest();
      contract.props.onDismissRequest();
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(
      splitAetherDialogActions([
        { label: "Cancel", role: "cancel" },
        { label: "Delete", role: "destructive" },
      ]),
    ).toEqual({
      confirm: { label: "Delete", role: "destructive" },
      dismiss: { label: "Cancel", role: "cancel" },
    });
  });
});
