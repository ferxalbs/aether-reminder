/**
 * ID strategy (Slice 2)
 * ----------------------
 * UUIDv7 (RFC 9562): 48-bit Unix millisecond timestamp + version/variant + random.
 *
 * Why UUIDv7:
 * - Sortable by creation time (helpful for indexes and agent references)
 * - Globally unique without coordination
 * - No large dependency (uses Web Crypto / Node crypto)
 *
 * Format: standard 8-4-4-4-12 hex string.
 * Used for: tasks, reminders, projects, tags, task_events, future tool/agent rows.
 */

function getRandomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Secure random number generator unavailable (globalThis.crypto).');
  }
  cryptoApi.getRandomValues(bytes);
  return bytes;
}

function byteToHex(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

/** Generate a new UUIDv7 string. */
export function createId(): string {
  const ms = BigInt(Date.now());
  const bytes = getRandomBytes(16);

  // 48-bit big-endian timestamp in bytes 0-5
  bytes[0] = Number((ms >> 40n) & 0xffn);
  bytes[1] = Number((ms >> 32n) & 0xffn);
  bytes[2] = Number((ms >> 24n) & 0xffn);
  bytes[3] = Number((ms >> 16n) & 0xffn);
  bytes[4] = Number((ms >> 8n) & 0xffn);
  bytes[5] = Number(ms & 0xffn);

  // Version 7 in high nibble of byte 6
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // RFC 4122 variant in high bits of byte 8
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, byteToHex).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** True if value looks like a UUID (v4 or v7) or a preserved legacy non-demo id. */
export function isPlausibleId(value: string): boolean {
  if (typeof value !== 'string' || value.length < 8 || value.length > 64) return false;
  if (/^demo-\d+$/i.test(value)) return false;
  return /^[A-Za-z0-9_-]+$/.test(value);
}
