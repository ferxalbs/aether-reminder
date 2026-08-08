import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const screenFiles = ['index.tsx', 'tasks.tsx'] as const;

describe('task screen virtualization', () => {
  for (const screenFile of screenFiles) {
    test(`${screenFile} keeps the bounded FlatList configuration`, async () => {
      const source = await readFile(resolve(appDirectory, screenFile), 'utf8');

      expect(source).toContain('<FlatList');
      expect(source).toContain('initialNumToRender={10}');
      expect(source).toContain('maxToRenderPerBatch={10}');
      expect(source).toContain('windowSize={7}');
      expect(source).toContain('removeClippedSubviews={Platform.OS === \'android\'}');
    });
  }
});
