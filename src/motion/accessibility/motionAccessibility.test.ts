import { describe, expect, test } from 'bun:test';
import { applyAccessibilityToBudget } from './motionEffects';

describe('motion accessibility overrides', () => {
  test('reduce motion disables glass and blur', () => {
    const result = applyAccessibilityToBudget(
      { reduceMotion: true, reduceTransparency: false, prefersCrossFade: true },
      true,
      true,
    );
    expect(result.allowLiveBlur).toBe(false);
    expect(result.allowNativeGlass).toBe(false);
  });

  test('reduce transparency disables glass where required', () => {
    const result = applyAccessibilityToBudget(
      { reduceMotion: false, reduceTransparency: true, prefersCrossFade: false },
      true,
      true,
    );
    expect(result.allowLiveBlur).toBe(false);
    expect(result.allowNativeGlass).toBe(false);
  });
});
