import { describe, expect, test } from 'bun:test';
import { parseNativeCapabilities, parseNativeSnapshot } from './snapshot';

describe('native snapshot validation', () => {
  test('rejects malformed payloads', () => {
    expect(parseNativeSnapshot(null)).toBeNull();
    expect(parseNativeSnapshot('nope')).toBeNull();
    expect(parseNativeSnapshot({ platform: 'web' })).toBeNull();
    expect(parseNativeSnapshot({ platform: 'android' })).toBeNull();
  });

  test('ignores invalid fields and keeps usable numbers', () => {
    const parsed = parseNativeSnapshot({
      platform: 'ios',
      currentRefreshRateHz: 'fast',
      maximumRefreshRateHz: 120,
      lowPowerMode: true,
      lowMemory: 'maybe',
      lowRamDevice: null,
      thermalState: 'boiling',
      warmUpActive: 1,
      timestampMs: 12,
      frames: {
        sampleWindowMs: 750,
        frameCount: 10,
        jankCount: 1,
        jankRatio: 'bad',
        averageFrameDurationMs: 8,
        frameOverrunP95Ms: undefined,
      },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.currentRefreshRateHz).toBeNull();
    expect(parsed?.thermalState).toBe('unknown');
    expect(parsed?.lowMemory).toBeNull();
    expect(parsed?.frames.jankRatio).toBeNull();
    expect(parsed?.frames.averageFrameDurationMs).toBe(8);
    expect(parsed?.lowPowerMode).toBe(true);
  });

  test('parses a complete snapshot', () => {
    const parsed = parseNativeSnapshot({
      platform: 'android',
      currentRefreshRateHz: 90,
      maximumRefreshRateHz: 120,
      lowPowerMode: false,
      lowMemory: false,
      lowRamDevice: false,
      thermalState: 'light',
      warmUpActive: false,
      timestampMs: 99,
      frames: {
        sampleWindowMs: 750,
        frameCount: 80,
        jankCount: 4,
        jankRatio: 0.05,
        averageFrameDurationMs: 11,
        frameOverrunP95Ms: 2,
      },
    });
    expect(parsed?.frames.jankRatio).toBe(0.05);
    expect(parsed?.thermalState).toBe('light');
  });
});

describe('native capabilities validation', () => {
  test('falls back safely when the module is unavailable', () => {
    expect(parseNativeCapabilities(null)).toBeNull();
  });

  test('keeps unknown platform without inventing metrics', () => {
    const parsed = parseNativeCapabilities({
      platform: 'desktop',
      androidApiLevel: 'q',
      supportsNativeBlur: true,
    });
    expect(parsed?.platform).toBe('unknown');
    expect(parsed?.androidApiLevel).toBeNull();
    expect(parsed?.supportsNativeBlur).toBe(true);
  });
});
