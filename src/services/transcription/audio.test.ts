import { describe, expect, test } from 'bun:test';
import { normalizePcm16 } from './audio';

describe('PCM normalization', () => {
  test('downmixes stereo and resamples native PCM16 to exact 24 kHz mono', () => {
    const stereo48k = new Int16Array([1000, 3000, 2000, 4000, 3000, 5000, 4000, 6000]);
    const normalized = new Int16Array(normalizePcm16(stereo48k.buffer, 48000, 2, 24000));
    expect(normalized.length).toBe(2);
    expect(normalized[0]).toBe(2000);
    expect(normalized[1]).toBe(4000);
  });
});
