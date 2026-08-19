import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANDROID_BLUR_SCALE_DEFAULT,
  parseAndroidBlurScale,
  resolveAndroidBlurScale,
} from "./blurScaleDiagnostic";

const ROOT = join(import.meta.dir, "../../..");

describe("Android blur scale diagnostic", () => {
  test("accepts exactly 1, 2, and 4", () => {
    expect(parseAndroidBlurScale("1")).toBe(1);
    expect(parseAndroidBlurScale("2")).toBe(2);
    expect(parseAndroidBlurScale("4")).toBe(4);
    expect(parseAndroidBlurScale("0")).toBeNull();
    expect(parseAndroidBlurScale("1.0")).toBeNull();
    expect(parseAndroidBlurScale(undefined)).toBeNull();
  });

  test("defaults invalid development input to the current 4f renderer", () => {
    expect(resolveAndroidBlurScale("1", true)).toBe(1);
    expect(resolveAndroidBlurScale("2", true)).toBe(2);
    expect(resolveAndroidBlurScale("4", true)).toBe(4);
    expect(resolveAndroidBlurScale("3", true)).toBe(ANDROID_BLUR_SCALE_DEFAULT);
  });

  test("release builds ignore the diagnostic selector and stay at 4f", () => {
    expect(resolveAndroidBlurScale("1", false)).toBe(4);
    expect(resolveAndroidBlurScale("2", false)).toBe(4);
    expect(resolveAndroidBlurScale("4", false)).toBe(4);
  });

  test("Android build policy sets API 31 without changing compile/target defaults", () => {
    const config = JSON.parse(readFileSync(join(ROOT, "app.json"), "utf8")) as {
      expo: { plugins: unknown[] };
    };
    const plugin = config.expo.plugins.find(
      (entry): entry is [string, { android: Record<string, number> }] =>
        Array.isArray(entry) && entry[0] === "expo-build-properties",
    );
    expect(plugin?.[1].android.minSdkVersion).toBe(31);
    expect(plugin?.[1].android.compileSdkVersion).toBeUndefined();
    expect(plugin?.[1].android.targetSdkVersion).toBeUndefined();
  });

  test("native diagnostic keeps the Dimezis call and noise flag invariant", () => {
    const view = readFileSync(
      join(
        ROOT,
        "modules/aether-motion/android/src/main/java/expo/modules/aethermotion/AetherAndroidBlurView.kt",
      ),
      "utf8",
    );
    const policy = readFileSync(
      join(
        ROOT,
        "modules/aether-motion/android/src/main/java/expo/modules/aethermotion/AetherBlurScalePolicy.kt",
      ),
      "utf8",
    );
    expect(view).toContain(
      "setupWith(\n      dimezisBlurTarget,\n      scaleFactor,\n      AetherBlurScalePolicy.APPLY_NOISE,\n    )",
    );
    expect(policy).toContain("const val APPLY_NOISE = false");
    expect(policy).toContain("1f, 2f, 4f");
  });

  test("uses the Dimezis release with RenderNode auto-update and draw clipping fixes", () => {
    const gradle = readFileSync(
      join(ROOT, "modules/aether-motion/android/build.gradle"),
      "utf8",
    );

    expect(gradle).toContain("com.github.Dimezis:BlurView:version-3.2.0");
    expect(gradle).not.toContain("com.github.Dimezis:BlurView:version-3.1.0");
  });

  test("iOS AdaptiveBlur source still owns the original expo-blur renderer path", () => {
    const adaptiveBlur = readFileSync(
      join(ROOT, "src/motion/components/AdaptiveBlur.tsx"),
      "utf8",
    );
    expect(adaptiveBlur).toContain("BlurViewProps");
    expect(adaptiveBlur).toContain('from "expo-blur"');
    expect(adaptiveBlur).toContain("blurMethod={decision.blurMethod}");
    expect(adaptiveBlur).not.toContain("AetherAndroidBlur");
  });
});
