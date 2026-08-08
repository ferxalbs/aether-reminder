const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Encode the int16 little-endian PCM ArrayBuffer expected by Realtime append events. */
export function pcm16ArrayBufferToBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const triple = (first << 16) | (second << 8) | third;
    output += BASE64_CHARS[(triple >> 18) & 0x3f];
    output += BASE64_CHARS[(triple >> 12) & 0x3f];
    output += index + 1 < bytes.length ? BASE64_CHARS[(triple >> 6) & 0x3f] : '=';
    output += index + 2 < bytes.length ? BASE64_CHARS[triple & 0x3f] : '=';
  }
  return output;
}

/** Return a low-cost normalized RMS level for the Orb's local visual feedback. */
export function pcm16AudioLevel(data: ArrayBuffer): number {
  if (data.byteLength < 2 || data.byteLength % 2 !== 0) return 0;
  const samples = new Int16Array(data);
  let sumSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const normalized = samples[index] / 32768;
    sumSquares += normalized * normalized;
  }
  return Math.min(1, Math.sqrt(sumSquares / samples.length) * 2.2);
}

/** Downmix interleaved PCM16 and linearly resample to the Realtime input rate. */
export function normalizePcm16(
  data: ArrayBuffer,
  sourceRate: number,
  sourceChannels: number,
  targetRate = 24000,
): ArrayBuffer {
  if (data.byteLength % 2 !== 0 || sourceRate <= 0 || sourceChannels < 1) {
    throw new Error('Invalid PCM16 audio format.');
  }
  const input = new Int16Array(data);
  const frames = Math.floor(input.length / sourceChannels);
  if (frames === 0) return new ArrayBuffer(0);
  const outputFrames = Math.max(1, Math.round(frames * targetRate / sourceRate));
  const output = new Int16Array(outputFrames);
  const sample = (frame: number) => {
    let total = 0;
    const bounded = Math.min(frames - 1, Math.max(0, frame));
    for (let channel = 0; channel < sourceChannels; channel += 1) {
      total += input[bounded * sourceChannels + channel];
    }
    return total / sourceChannels;
  };
  for (let index = 0; index < outputFrames; index += 1) {
    const position = index * sourceRate / targetRate;
    const left = Math.floor(position);
    const fraction = position - left;
    output[index] = Math.round(sample(left) * (1 - fraction) + sample(left + 1) * fraction);
  }
  return output.buffer;
}
