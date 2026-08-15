import { describe, expect, test } from 'bun:test';
import { parseNativeCapabilities, parseNativeSnapshot } from './snapshot';

describe('native snapshot validation', () => {
  test('rejects malformed payloads', () => {
    expect(parseNativeSnapshot(null)).toBeNull();
    expect(parseNativeSnapshot('nope')).toBeNull();
    expect(parseNativeSnapshot({ platform: 'web' })).toBeNull();
    expect(parseNativeSnapshot({ platform: 'android' })).toBeNull();
    expect(parseNativeSnapshot({
      platform: 'ios',
      frames: { frameCount: -1, jankCount: 0 },
    })).toBeNull();
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
    expect(parsed?.memoryPressureActive).toBeNull();
    expect(parsed?.frames.jankRatio).toBeNull();
    expect(parsed?.frames.averageFrameDurationMs).toBe(8);
    expect(parsed?.lowPowerMode).toBe(true);
    expect(parsed?.frames.cadenceIntervalMs).toBeNull();
    expect(parsed?.frames.callbackDelayP95Ms).toBeNull();
  });

  test('parses a complete snapshot', () => {
    const parsed = parseNativeSnapshot({
      platform: 'android',
      currentRefreshRateHz: 90,
      maximumRefreshRateHz: 120,
      lowPowerMode: false,
      lowMemory: false,
      memoryPressureActive: false,
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
    expect(parsed?.memoryPressureActive).toBe(false);
  });

  test('accepts missing optional iOS jank fields as null', () => {
    const parsed = parseNativeSnapshot({
      platform: 'ios',
      currentRefreshRateHz: 60,
      maximumRefreshRateHz: 120,
      lowPowerMode: false,
      frames: {
        sampleWindowMs: 750,
        frameCount: 45,
        jankCount: 0,
      },
    });
    expect(parsed?.frames.jankRatio).toBeNull();
    expect(parsed?.frames.frameOverrunP95Ms).toBeNull();
    expect(parsed?.frames.cadenceIntervalMs).toBeNull();
    expect(parsed?.frames.callbackDelayP95Ms).toBeNull();
  });

  test('keeps explicit jankRatio null', () => {
    const parsed = parseNativeSnapshot({
      platform: 'ios',
      frames: {
        frameCount: 40,
        jankCount: 0,
        jankRatio: null,
        frameOverrunP95Ms: null,
      },
    });
    expect(parsed?.frames.jankRatio).toBeNull();
    expect(parsed?.frames.frameOverrunP95Ms).toBeNull();
  });

  test('accepts unusual valid refresh rates', () => {
    for (const rate of [24, 30, 40, 48, 60, 80, 90, 120]) {
      const parsed = parseNativeSnapshot({
        platform: 'ios',
        currentRefreshRateHz: rate,
        maximumRefreshRateHz: 120,
        frames: { frameCount: 10, jankCount: 0, jankRatio: null, cadenceIntervalMs: 1000 / rate },
      });
      expect(parsed?.currentRefreshRateHz).toBe(rate);
      expect(parsed?.frames.cadenceIntervalMs).toBeCloseTo(1000 / rate);
    }
  });

  test('rejects zero, negative, NaN, and infinite refresh rates', () => {
    for (const rate of [0, -60, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const parsed = parseNativeSnapshot({
        platform: 'ios',
        currentRefreshRateHz: rate,
        maximumRefreshRateHz: rate,
        frames: { frameCount: 1, jankCount: 0 },
      });
      expect(parsed).not.toBeNull();
      expect(parsed?.currentRefreshRateHz).toBeNull();
      expect(parsed?.maximumRefreshRateHz).toBeNull();
    }
  });

  test('maps legacy lowMemory onto memoryPressureActive', () => {
    const parsed = parseNativeSnapshot({
      platform: 'ios',
      lowMemory: true,
      frames: { frameCount: 1, jankCount: 0, jankRatio: null },
    });
    expect(parsed?.memoryPressureActive).toBe(true);
    expect(parsed?.lowMemory).toBe(true);
  });

  test('prefers explicit temporary memory pressure', () => {
    const parsed = parseNativeSnapshot({
      platform: 'ios',
      lowMemory: false,
      memoryPressureActive: true,
      frames: { frameCount: 1, jankCount: 0, jankRatio: null },
    });
    expect(parsed?.memoryPressureActive).toBe(true);
  });

  test('absent memory state stays null', () => {
    const parsed = parseNativeSnapshot({
      platform: 'android',
      frames: { frameCount: 1, jankCount: 0, jankRatio: 0 },
    });
    expect(parsed?.memoryPressureActive).toBeNull();
    expect(parsed?.lowMemory).toBeNull();
  });

  test('malformed snapshots never throw', () => {
    const payloads: unknown[] = [
      undefined,
      12,
      [],
      { platform: 'ios', frames: { frameCount: Number.NaN, jankCount: 0 } },
      { platform: 'android', frames: { frameCount: Number.POSITIVE_INFINITY, jankCount: 1 } },
      { platform: 'ios', frames: { frameCount: 1, jankCount: Number.NEGATIVE_INFINITY } },
    ];
    for (const payload of payloads) {
      expect(() => parseNativeSnapshot(payload)).not.toThrow();
    }
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
