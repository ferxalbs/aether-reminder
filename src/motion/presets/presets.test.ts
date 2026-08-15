import { describe, expect, test } from 'bun:test';
import { MOTION_PRESET_IDS, resolveMotionPreset } from './catalog';
import type { MotionTier } from '../core/types';

const tiers: MotionTier[] = ['full', 'standard', 'reduced', 'minimal'];

describe('motion presets', () => {
  test('every semantic preset resolves for every tier', () => {
    for (const id of MOTION_PRESET_IDS) {
      for (const tier of tiers) {
        const preset = resolveMotionPreset(id, tier);
        expect(preset.id).toBe(id);
        expect(preset.tier).toBe(tier);
        expect(['spring', 'timing', 'none']).toContain(preset.mode);
      }
    }
  });

  test('task.complete stays causal across tiers', () => {
    const full = resolveMotionPreset('task.complete', 'full');
    const minimal = resolveMotionPreset('task.complete', 'minimal');
    expect(full.mode).toBe('spring');
    expect(full.haptic).toBe(true);
    expect(full.secondaryMotion).toBe(true);
    expect(minimal.mode).toBe('timing');
    expect(minimal.haptic).toBe(true);
    expect(minimal.secondaryMotion).toBe(false);
    expect(minimal.durationMs).toBeLessThan(full.durationMs);
  });

  test('orb continuous motion is gated by tier', () => {
    expect(resolveMotionPreset('orb.listen', 'full').continuous).toBe(true);
    expect(resolveMotionPreset('orb.listen', 'minimal').continuous).toBe(false);
    expect(resolveMotionPreset('orb.idle', 'standard').continuous).toBe(false);
  });

  test('minimal navigation prefers no travel', () => {
    const preset = resolveMotionPreset('navigation.push', 'minimal');
    expect(preset.mode).toBe('none');
    expect(preset.translateY).toBe(0);
  });
});
