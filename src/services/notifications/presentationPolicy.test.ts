import { describe, expect, test } from "bun:test";
import {
  mapPresentationPolicyToAndroid,
  mapPresentationPolicyToApple,
  presentationPolicyForReminder,
} from "./presentationPolicy";

describe("notification presentation policy", () => {
  test("adaptive reminders use a stable lower-pressure Android channel", () => {
    expect(mapPresentationPolicyToAndroid("gentle")).toEqual({
      channelId: "aether-adaptive-reminders",
      channelName: "AETHER Follow-ups",
      importance: "low",
    });
    expect(mapPresentationPolicyToAndroid("standard").channelId).toBe(
      "aether-reminders",
    );
  });

  test("Apple mapping stays passive/active and never escalates adaptive nudges", () => {
    expect(mapPresentationPolicyToApple("gentle")).toEqual({
      interruptionLevel: "passive",
    });
    expect(mapPresentationPolicyToApple("attention_required")).toEqual({
      interruptionLevel: "active",
    });
  });

  test("reminder kind selects the shared semantic policy", () => {
    expect(
      presentationPolicyForReminder({ kind: "adaptive_followup" } as never),
    ).toBe("gentle");
    expect(presentationPolicyForReminder({ kind: "primary" } as never)).toBe(
      "standard",
    );
  });
});
