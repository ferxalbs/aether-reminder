import { describe, expect, test } from 'bun:test';
import { resolveMotionPreset } from './catalog';
import type { MotionTier } from '../core/types';

const tiers: MotionTier[] = ['full', 'standard', 'reduced', 'minimal'];

describe('reanimated-safe preset configs', () => {
  test('spring configs contain only numeric worklet-safe fields', () => {
    for (const tier of tiers) {
      const preset = resolveMotionPreset('surface.press', tier);
      expect(typeof preset.damping).toBe('number');
      expect(typeof preset.stiffness).toBe('number');
      expect(typeof preset.mass).toBe('number');
      expect(typeof preset.scale).toBe('number');
      expect(Number.isFinite(preset.damping)).toBe(true);
    }
  });

  test('task completion never animates layout geometry fields', () => {
    const preset = resolveMotionPreset('task.complete', 'full');
    expect(preset).not.toHaveProperty('width');
    expect(preset).not.toHaveProperty('height');
    expect(preset).not.toHaveProperty('margin');
    expect(preset.scale).toBeGreaterThan(0);
  });

  test('fake-timer semantics: minimal duration is bounded', () => {
    const preset = resolveMotionPreset('sheet.present', 'minimal');
    expect(preset.durationMs).toBeLessThanOrEqual(120);
  });
});
