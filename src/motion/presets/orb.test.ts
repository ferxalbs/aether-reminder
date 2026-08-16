import { describe, expect, test } from "bun:test";
import { resolveMotionPreset } from "./catalog";

describe("orb state animation contract", () => {
  test("listen deforms on capable tiers and becomes static when minimal", () => {
    const full = resolveMotionPreset("orb.listen", "full");
    const reduced = resolveMotionPreset("orb.listen", "reduced");
    const minimal = resolveMotionPreset("orb.listen", "minimal");
    expect(full.continuous).toBe(true);
    expect(full.scale).toBeGreaterThan(1);
    expect(reduced.continuous).toBe(false);
    expect(minimal.mode).toBe("none");
    expect(minimal.scale).toBe(1);
  });

  test("think is not decorative on reduced hardware", () => {
    expect(resolveMotionPreset("orb.think", "reduced").mode).toBe("none");
    expect(resolveMotionPreset("orb.think", "minimal").continuous).toBe(false);
  });
});
