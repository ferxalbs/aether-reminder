import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '../../..');
const SRC = join(ROOT, 'src');
const MODULE = join(ROOT, 'modules/aether-motion');

const SOC_PATTERN =
  /\b(snapdragon|exynos|mediatek|tensor|kirin|unisoc|adreno|mali)\b/i;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|js|kt|swift)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe('adaptive motion architecture guard', () => {
  test('runtime code does not use SoC or GPU-name whitelists', () => {
    const files = [...walk(SRC), ...walk(MODULE)].filter(
      (file) =>
        !file.includes('/docs/')
        && !file.endsWith('.md')
        && !file.endsWith('.test.ts')
        && !file.endsWith('.test.tsx'),
    );
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (SOC_PATTERN.test(text)) hits.push(file.replace(ROOT + '/', ''));
    }
    expect(hits).toEqual([]);
  });

  test('expensive BlurView stays behind AdaptiveBlur', () => {
    const files = walk(SRC).filter((file) => file.endsWith('.tsx') || file.endsWith('.ts'));
    const hits: string[] = [];
    for (const file of files) {
      if (file.endsWith('AdaptiveBlur.tsx')) continue;
      const text = readFileSync(file, 'utf8');
      if (/import\s+(?:type\s+)?\{[^}]*\bBlurView\b/.test(text) || /import\s+\{\s*BlurView\b/.test(text)) {
        hits.push(file.replace(ROOT + '/', ''));
      }
    }
    expect(hits).toEqual([]);
  });

  test('native frame callback does not send JS events', () => {
    const android = readFileSync(
      join(MODULE, 'android/src/main/java/expo/modules/aethermotion/AetherMotionModule.kt'),
      'utf8',
    );
    const frameFn = android.slice(android.indexOf('private fun onFrame'), android.indexOf('private fun frameDurationNs'));
    expect(frameFn).not.toContain('sendEvent');
    expect(frameFn).not.toContain('Log.');

    const ios = readFileSync(join(MODULE, 'ios/AetherMotionModule.swift'), 'utf8');
    const tick = ios.slice(ios.indexOf('func handleDisplayLink'), ios.indexOf('private func emitSnapshot'));
    expect(tick).not.toContain('sendEvent');
  });
});
