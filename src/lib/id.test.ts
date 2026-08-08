import { describe, expect, test } from 'bun:test';
import { createId, isPlausibleId } from './id';

describe('createId (UUIDv7)', () => {
  test('produces version-7 UUID shape', () => {
    const id = createId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  test('generates unique values', () => {
    const set = new Set(Array.from({ length: 50 }, () => createId()));
    expect(set.size).toBe(50);
  });

  test('isPlausibleId rejects demo ids', () => {
    expect(isPlausibleId('demo-1')).toBe(false);
    expect(isPlausibleId(createId())).toBe(true);
    expect(isPlausibleId('task-user-1')).toBe(true);
  });
});
