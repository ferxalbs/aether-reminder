export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  shouldRetry: (error: unknown) => boolean;
  getRetryAfterMs?: (error: unknown) => number | undefined;
  onRetry?: (nextAttempt: number, delayMs: number, error: unknown) => void;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}

export interface TimeoutSignal {
  signal: AbortSignal;
  didTimeout: () => boolean;
  cleanup: () => void;
}

function abortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

export function sleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, delayMs));
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function createTimeoutSignal(parent: AbortSignal | null | undefined, timeoutMs: number): TimeoutSignal {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1, timeoutMs));
  const onAbort = () => controller.abort();
  if (parent?.aborted) controller.abort();
  else parent?.addEventListener('abort', onAbort, { once: true });

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      parent?.removeEventListener('abort', onAbort);
    },
  };
}

export async function retryWithBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 400);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 4_000);
  const wait = options.sleep ?? sleep;
  let attempt = 0;

  while (true) {
    if (options.signal?.aborted) throw abortError();
    try {
      return await operation(attempt);
    } catch (error) {
      const hasAttemptsLeft = attempt + 1 < maxAttempts;
      if (!hasAttemptsLeft || !options.shouldRetry(error)) throw error;

      const retryAfterMs = options.getRetryAfterMs?.(error);
      const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const delayMs = retryAfterMs === undefined
        ? exponentialDelay
        : Math.min(maxDelayMs, Math.max(0, retryAfterMs));
      const nextAttempt = attempt + 1;
      options.onRetry?.(nextAttempt, delayMs, error);
      await wait(delayMs, options.signal);
      attempt = nextAttempt;
    }
  }
}
