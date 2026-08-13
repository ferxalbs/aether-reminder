import { describe, expect, test } from 'bun:test';
import {
  MAX_CAPTURE_IMAGE_BYTES,
  createCaptureEnvelope,
  normalizeCaptureEnvelope,
  normalizeCaptureUrl,
  partsFromSharedText,
} from './normalization';
import { CaptureError } from './types';

const base = {
  id: 'capture-1',
  ingress: 'android_share' as const,
  createdAt: '2026-08-12T12:00:00.000Z',
  idempotencyKey: 'native-callback-1',
  state: 'pending' as const,
  reviewRequired: true,
};

describe('Universal Capture normalization', () => {
  test('normalizes text line endings without changing content order', () => {
    const envelope = normalizeCaptureEnvelope({
      ...base,
      parts: [{ kind: 'text', text: '  First\r\nSecond  ' }],
    });
    expect(envelope.parts).toEqual([{ kind: 'text', text: 'First\nSecond' }]);
  });

  test('preserves the exact original valid URL', () => {
    const url = 'https://example.com/A%2Fb?q=private%20value#Keep';
    expect(normalizeCaptureUrl(url)).toBe(url);
    expect(partsFromSharedText(url)).toEqual([{ kind: 'url', url }]);
  });

  test('normalizes safe image metadata and strips path components from names', () => {
    const envelope = createCaptureEnvelope({
      ingress: 'ios_share_extension',
      id: 'capture-image',
      parts: [{
        kind: 'image',
        assetRef: 'capture://capture-image/screenshot.png',
        mimeType: 'IMAGE/PNG',
        sizeBytes: 123,
        displayName: '../../Screenshot.png',
      }],
    });
    expect(envelope.parts[0]).toEqual({
      kind: 'image',
      assetRef: 'capture://capture-image/screenshot.png',
      mimeType: 'image/png',
      sizeBytes: 123,
      displayName: 'Screenshot.png',
    });
  });

  test('rejects empty, malformed, unsupported, and oversized payloads', () => {
    const failures = [
      () => normalizeCaptureEnvelope({ ...base, parts: [] }),
      () => normalizeCaptureEnvelope({ ...base, parts: [{ kind: 'text', text: '  ' }] }),
      () => normalizeCaptureEnvelope({ ...base, parts: [{ kind: 'url', url: 'javascript:alert(1)' }] }),
      () => normalizeCaptureEnvelope({
        ...base,
        parts: [{ kind: 'image', assetRef: 'capture://x', mimeType: 'application/pdf' }],
      }),
      () => normalizeCaptureEnvelope({
        ...base,
        parts: [{
          kind: 'image',
          assetRef: 'capture://x',
          mimeType: 'image/png',
          sizeBytes: MAX_CAPTURE_IMAGE_BYTES + 1,
        }],
      }),
    ];
    for (const failure of failures) expect(failure).toThrow(CaptureError);
  });
});
