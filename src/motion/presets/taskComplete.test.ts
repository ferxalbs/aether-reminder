import { describe, expect, test } from 'bun:test';
import { resolveMotionPreset } from './catalog';

describe('task complete animation contract', () => {
  test('full uses spring plus secondary confirmation', () => {
    const preset = resolveMotionPreset('task.complete', 'full');
    expect(preset.mode).toBe('spring');
    expect(preset.secondaryMotion).toBe(true);
    expect(preset.haptic).toBe(true);
  });

  test('minimal keeps confirmation through opacity timing and haptics', () => {
    const preset = resolveMotionPreset('task.complete', 'minimal');
    expect(preset.mode).toBe('timing');
    expect(preset.durationMs).toBeGreaterThan(0);
    expect(preset.haptic).toBe(true);
    expect(preset.secondaryMotion).toBe(false);
  });
});
