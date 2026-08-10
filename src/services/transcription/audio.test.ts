import { describe, expect, test } from 'bun:test';
import { Pcm16StreamNormalizer, pcm16ToBase64 } from './audio';

function pcm(samples: number[]): ArrayBuffer {
  const data = new ArrayBuffer(samples.length * 2);
  const view = new DataView(data);
  samples.forEach((sample, index) => view.setInt16(index * 2, sample, true));
  return data;
}

function samples(data: ArrayBuffer): number[] {
  const view = new DataView(data);
  return Array.from({ length: data.byteLength / 2 }, (_, index) => view.getInt16(index * 2, true));
}

describe('PCM16 streaming normalization', () => {
  test('passes 24 kHz mono int16 through without relabeling or conversion', () => {
    const input = pcm([-32768, -1, 0, 1, 32767]);
    const output = new Pcm16StreamNormalizer().push({ data: input, sampleRate: 24000, channels: 1, timestamp: 0 });
    expect(samples(output)).toEqual([-32768, -1, 0, 1, 32767]);
  });

  test('resamples 48 kHz PCM16 to 24 kHz', () => {
    const input = pcm([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000]);
    const output = new Pcm16StreamNormalizer().push({ data: input, sampleRate: 48000, channels: 1, timestamp: 0 });
    expect(samples(output)).toEqual([0, 2000, 4000, 6000]);
  });

  test('resamples 44.1 kHz to exactly 240 output frames for 10 ms', () => {
    const input = pcm(Array.from({ length: 441 }, (_, index) => index * 10));
    const normalizer = new Pcm16StreamNormalizer();
    const output = normalizer.push({ data: input, sampleRate: 44100, channels: 1, timestamp: 0 });
    expect(output.byteLength / 2).toBe(240);
  });

  test('downmixes interleaved stereo to mono before resampling', () => {
    const output = new Pcm16StreamNormalizer().push({
      data: pcm([1000, 3000, -1000, 1000]),
      sampleRate: 24000,
      channels: 2,
      timestamp: 0,
    });
    expect(samples(output)).toEqual([2000, 0]);
  });

  test('preserves resampling phase across native buffer boundaries', () => {
    const normalizer = new Pcm16StreamNormalizer();
    const first = normalizer.push({ data: pcm([0, 1000, 2000]), sampleRate: 48000, channels: 1, timestamp: 0 });
    const second = normalizer.push({ data: pcm([3000, 4000, 5000]), sampleRate: 48000, channels: 1, timestamp: 0.00006 });
    expect([...samples(first), ...samples(second)]).toEqual([0, 2000, 4000]);
  });

  test('Base64 frames the original little-endian PCM bytes', () => {
    expect(pcm16ToBase64(pcm([256]))).toBe('AAE=');
    expect(() => pcm16ToBase64(new Uint8Array([1]).buffer)).toThrow('complete samples');
  });
});
