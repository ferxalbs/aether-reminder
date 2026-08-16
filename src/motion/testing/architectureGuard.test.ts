import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const SRC = join(ROOT, "src");
const MODULE = join(ROOT, "modules/aether-motion");

const SOC_PATTERN =
  /\b(snapdragon|exynos|mediatek|tensor|kirin|unisoc|adreno|mali)\b/i;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|js|kt|swift)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe("adaptive motion architecture guard", () => {
  test("runtime code does not use SoC or GPU-name whitelists", () => {
    const files = [...walk(SRC), ...walk(MODULE)].filter(
      (file) =>
        !file.includes("/docs/") &&
        !file.endsWith(".md") &&
        !file.endsWith(".test.ts") &&
        !file.endsWith(".test.tsx"),
    );
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (SOC_PATTERN.test(text)) hits.push(file.replace(ROOT + "/", ""));
    }
    expect(hits).toEqual([]);
  });

  test("expensive BlurView stays behind AdaptiveBlur", () => {
    const files = walk(SRC).filter(
      (file) => file.endsWith(".tsx") || file.endsWith(".ts"),
    );
    const hits: string[] = [];
    for (const file of files) {
      if (file.endsWith("AdaptiveBlur.tsx")) continue;
      const text = readFileSync(file, "utf8");
      if (
        /import\s+(?:type\s+)?\{[^}]*\bBlurView\b/.test(text) ||
        /import\s+\{\s*BlurView\b/.test(text)
      ) {
        hits.push(file.replace(ROOT + "/", ""));
      }
    }
    expect(hits).toEqual([]);
  });

  test("native frame callback does not send JS events", () => {
    const android = readFileSync(
      join(
        MODULE,
        "android/src/main/java/expo/modules/aethermotion/AetherMotionModule.kt",
      ),
      "utf8",
    );
    const frameFn = android.slice(
      android.indexOf("private fun onFrame"),
      android.indexOf("private fun frameDurationNs"),
    );
    expect(frameFn).not.toContain("sendEvent");
    expect(frameFn).not.toContain("Log.");

    const ios = readFileSync(
      join(MODULE, "ios/AetherMotionModule.swift"),
      "utf8",
    );
    const tick = ios.slice(
      ios.indexOf("func handleDisplayLink"),
      ios.indexOf("private func emitSnapshot"),
    );
    expect(tick).not.toContain("sendEvent");
  });

  test("iOS cadence classification does not use maximum refresh rate as required FPS", () => {
    const ios = readFileSync(
      join(MODULE, "ios/AetherMotionModule.swift"),
      "utf8",
    );
    const tick = ios.slice(
      ios.indexOf("func handleDisplayLink"),
      ios.indexOf("private func emitSnapshot"),
    );
    expect(tick).not.toContain("maximumRefreshRateHz");
    expect(tick).not.toContain("link.duration");
    expect(tick).toContain("CadenceTelemetry.scheduledIntervalSeconds");
    expect(tick).toContain("isJank: false");

    const cadence = readFileSync(
      join(MODULE, "ios/CadenceTelemetry.swift"),
      "utf8",
    );
    expect(cadence).toContain("cadenceDifferenceIsJank");
    expect(cadence).toMatch(/return false/);
  });

  test("Android frame aggregation is explicitly synchronized", () => {
    const aggregator = readFileSync(
      join(
        MODULE,
        "android/src/main/java/expo/modules/aethermotion/FrameAggregator.kt",
      ),
      "utf8",
    );
    expect(aggregator).toContain("private val lock = Any()");
    expect(aggregator).toContain("synchronized(lock)");
    expect(aggregator).toContain("fun snapshotAndReset");
    expect(aggregator).toContain("copyOf");
  });


  test("MotionProvider reads native capabilities once and rerenders only on profile change", () => {
    const provider = readFileSync(
      join(SRC, "motion/runtime/MotionProvider.tsx"),
      "utf8",
    );
    const reads = provider.match(/readNativeCapabilities\(/g) ?? [];
    expect(reads).toHaveLength(1);
    expect(provider).toContain(
      "readNativeCapabilities() ?? platformCapabilities()",
    );
    expect(provider).not.toContain("governor.hydrate");
    expect(provider).toContain("if (!profilesEqual(profileCurrent, next))");
    expect(provider).toContain("setProfile(next)");
  });

  test("iOS memory-pressure cooldown stays a named AETHER constant", () => {
    const policy = readFileSync(
      join(MODULE, "ios/MemoryPressurePolicy.swift"),
      "utf8",
    );
    const ts = readFileSync(join(SRC, "motion/core/thresholds.ts"), "utf8");
    expect(policy).toMatch(/static let cooldownMs: Double = 180_000/);
    expect(ts).toMatch(/MOTION_MEMORY_PRESSURE_COOLDOWN_MS = 180_000/);
    expect(policy).toContain("Not an Apple");
  });
});
