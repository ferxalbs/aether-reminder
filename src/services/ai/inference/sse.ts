/**
 * Minimal SSE line parser for OpenRouter / OpenAI-compatible streams.
 * Emits data payloads only (ignores comments / event names).
 */

import { reportNonFatalError } from '@/lib/nonFatalError';

export async function* parseSseStream(
  body: ReadableStream<Uint8Array> | null,
  signal: AbortSignal
): AsyncGenerator<string, void, unknown> {
  if (!body) return;

  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const cancelReader = () => {
    void reader.cancel().catch((error: unknown) => {
      reportNonFatalError('sse-reader-cancel', error);
    });
  };
  signal.addEventListener('abort', cancelReader, { once: true });

  try {
    while (true) {
      if (signal.aborted) {
        cancelReader();
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? '';

      for (const line of parts) {
        const trimmed = line.trimEnd();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed.startsWith('data:')) {
          const data = trimmed.slice(5).trimStart();
          if (data) yield data;
        }
      }
    }

    // Flush trailing data line without newline
    if (buffer.trim().startsWith('data:')) {
      const data = buffer.trim().slice(5).trimStart();
      if (data) yield data;
    }
  } finally {
    signal.removeEventListener('abort', cancelReader);
    try {
      reader.releaseLock();
    } catch (error) {
      reportNonFatalError('sse-reader-release', error);
    }
  }
}
