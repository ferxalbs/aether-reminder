import { describe, expect, test } from 'bun:test';
import { resolveTheme } from './resolveTheme';

describe('resolveTheme', () => {
  test('explicit light and dark win', () => {
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
  });

  test('system follows appearance', () => {
    expect(resolveTheme('system', 'light')).toBe('light');
    expect(resolveTheme('system', 'dark')).toBe('dark');
  });

  test('system defaults to dark when scheme unknown', () => {
    expect(resolveTheme('system', null)).toBe('dark');
    expect(resolveTheme('system', undefined)).toBe('dark');
  });
});
