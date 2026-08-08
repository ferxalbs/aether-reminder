import { describe, expect, test } from 'bun:test';
import { retryWithBackoff } from './retry';

describe('retryWithBackoff', () => {
  test('retries retryable failures with bounded exponential delays', async () => {
    let attempts = 0;
    const delays: number[] = [];

    const result = await retryWithBackoff(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('temporary');
        return 'ok';
      },
      {
        baseDelayMs: 10,
        maxDelayMs: 15,
        shouldRetry: () => true,
        sleep: async (delayMs) => {
          delays.push(delayMs);
        },
      }
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
    expect(delays).toEqual([10, 15]);
  });

  test('does not retry non-retryable failures', async () => {
    let attempts = 0;
    await expect(
      retryWithBackoff(
        async () => {
          attempts += 1;
          throw new Error('invalid');
        },
        { shouldRetry: () => false, sleep: async () => undefined }
      )
    ).rejects.toThrow('invalid');
    expect(attempts).toBe(1);
  });
});
