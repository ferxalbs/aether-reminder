import { describe, expect, test } from "bun:test";
import { TranscriptReconciler } from "./reconciler";
import { initialVoiceSnapshot } from "./stateMachine";

describe("realtime transcript reconciliation", () => {
  test("accumulates deltas by item_id", () => {
    const reconciler = new TranscriptReconciler();
    const one = {
      ...initialVoiceSnapshot,
      ...reconciler.delta(initialVoiceSnapshot, "item-a", "Remind "),
    };
    const two = { ...one, ...reconciler.delta(one, "item-a", "me") };
    const other = { ...two, ...reconciler.delta(two, "item-b", "Other") };
    expect(two.partialTranscript).toBe("Remind me");
    expect(other.partialTranscript).toBe("Other");
  });

  test("treats completion as authoritative and reconciles by item_id regardless of delta order", () => {
    const reconciler = new TranscriptReconciler();
    reconciler.delta(initialVoiceSnapshot, "item-b", "unrelated");
    const completed = reconciler.completed("item-a", "Remind me tomorrow");
    expect(completed).toMatchObject({
      activeItemId: "item-a",
      finalTranscript: "Remind me tomorrow",
    });
  });
});
