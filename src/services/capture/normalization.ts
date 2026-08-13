import { createId } from '@/lib/id';
import type { CaptureEnvelope, CaptureIngress, CapturePart } from './types';
import { CaptureError } from './types';

export const MAX_CAPTURE_TEXT_LENGTH = 10_000;
export const MAX_CAPTURE_IMAGE_BYTES = 15 * 1024 * 1024;
export const SUPPORTED_CAPTURE_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
]);

const INGRESS = new Set<CaptureIngress>([
  'in_app',
  'voice',
  'android_share',
  'android_quick_settings',
  'android_shortcut',
  'ios_share_extension',
  'ios_app_intent',
  'ios_app_shortcut',
  'deep_link',
]);

function assertStableToken(value: string, field: string): string {
  if (!value || value === '.' || value === '..' || value.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new CaptureError('invalid_envelope', `${field} is invalid.`);
  }
  return value;
}

export function normalizeCaptureUrl(raw: string): string {
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new CaptureError('malformed_url', 'The shared URL is invalid.', false, { cause });
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new CaptureError('malformed_url', 'Only HTTP and HTTPS URLs are supported.');
  }
  // Preserve the exact original URL text rather than URL-serializing it.
  return value;
}

export function normalizeCaptureText(raw: string): string {
  const value = raw.replace(/\r\n?/g, '\n').trim();
  if (!value) throw new CaptureError('empty_payload', 'Capture text is empty.');
  if (value.length > MAX_CAPTURE_TEXT_LENGTH) {
    throw new CaptureError('oversized_payload', 'Capture text is too large.');
  }
  return value;
}

function safeDisplayName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const leaf = value.replace(/\\/g, '/').split('/').pop()?.trim();
  if (!leaf) return undefined;
  return leaf.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || undefined;
}

export function normalizeCapturePart(part: CapturePart): CapturePart {
  switch (part.kind) {
    case 'text':
      return { kind: 'text', text: normalizeCaptureText(part.text) };
    case 'url':
      return { kind: 'url', url: normalizeCaptureUrl(part.url) };
    case 'image': {
      const mimeType = part.mimeType.trim().toLowerCase();
      if (!SUPPORTED_CAPTURE_IMAGE_MIMES.has(mimeType)) {
        throw new CaptureError('unsupported_mime', `Unsupported image MIME type: ${mimeType || 'empty'}.`);
      }
      if (!part.assetRef.trim()) {
        throw new CaptureError('asset_unavailable', 'The captured image is unavailable.', true);
      }
      if (part.sizeBytes !== undefined
        && (!Number.isSafeInteger(part.sizeBytes) || part.sizeBytes < 0 || part.sizeBytes > MAX_CAPTURE_IMAGE_BYTES)) {
        throw new CaptureError('oversized_payload', 'The captured image is too large.');
      }
      return {
        kind: 'image',
        assetRef: part.assetRef.trim(),
        mimeType,
        ...(part.sizeBytes === undefined ? {} : { sizeBytes: part.sizeBytes }),
        ...(safeDisplayName(part.displayName) ? { displayName: safeDisplayName(part.displayName) } : {}),
      };
    }
    default:
      throw new CaptureError('unsupported_part', 'This capture payload is not supported.');
  }
}

export function normalizeCaptureEnvelope(envelope: CaptureEnvelope): CaptureEnvelope {
  if (!INGRESS.has(envelope.ingress)) {
    throw new CaptureError('invalid_envelope', 'Capture ingress is invalid.');
  }
  if (!Array.isArray(envelope.parts) || envelope.parts.length === 0) {
    throw new CaptureError('empty_payload', 'Capture has no supported content.');
  }
  if (envelope.parts.length > 8) {
    throw new CaptureError('unsupported_part', 'Capture has too many parts.');
  }
  const parts = envelope.parts.map(normalizeCapturePart);
  if (parts.filter((part) => part.kind === 'image').length > 1) {
    throw new CaptureError('unsupported_part', 'Only one image can be captured at a time.');
  }
  if (!Number.isFinite(Date.parse(envelope.createdAt))) {
    throw new CaptureError('invalid_envelope', 'Capture creation time is invalid.');
  }
  return {
    ...envelope,
    id: assertStableToken(envelope.id, 'Capture ID'),
    idempotencyKey: assertStableToken(envelope.idempotencyKey, 'Idempotency key'),
    parts,
  };
}

export function createCaptureEnvelope(input: {
  ingress: CaptureIngress;
  parts: CapturePart[];
  reviewRequired?: boolean;
  id?: string;
  idempotencyKey?: string;
  createdAt?: string;
}): CaptureEnvelope {
  const id = input.id ?? createId();
  return normalizeCaptureEnvelope({
    id,
    ingress: input.ingress,
    parts: input.parts,
    createdAt: input.createdAt ?? new Date().toISOString(),
    idempotencyKey: input.idempotencyKey ?? id,
    state: 'pending',
    reviewRequired: input.reviewRequired ?? false,
  });
}

export function partsFromSharedText(text: string): CapturePart[] {
  const normalized = normalizeCaptureText(text);
  try {
    return [{ kind: 'url', url: normalizeCaptureUrl(normalized) }];
  } catch {
    return [{ kind: 'text', text: normalized }];
  }
}
