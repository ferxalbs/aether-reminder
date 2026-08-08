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
