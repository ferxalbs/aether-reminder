import { describe, expect, test } from "bun:test";
import {
  conservativeCapabilities,
  staticCeilingFromCapabilities,
} from "./capabilities";

describe("static capability ceiling", () => {
  test("does not inspect device, SoC, or GPU names", () => {
    const source = staticCeilingFromCapabilities.toString();
    expect(source).not.toMatch(/snapdragon|exynos|mediatek/i);
  });

  test("low RAM is a coarse ceiling, not a device table", () => {
    expect(
      staticCeilingFromCapabilities({
        ...conservativeCapabilities("android"),
        lowRamDevice: true,
        nativeTelemetryAvailable: true,
      }).ceiling,
    ).toBe("reduced");
  });
});
