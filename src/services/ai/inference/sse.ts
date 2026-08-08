/**
 * Minimal SSE line parser for OpenRouter / OpenAI-compatible streams.
 * Emits data payloads only (ignores comments / event names).
 */

export async function* parseSseStream(
  body: ReadableStream<Uint8Array> | null,
  signal: AbortSignal
): AsyncGenerator<string, void, unknown> {
  if (!body) return;

  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      if (signal.aborted) {
        await reader.cancel().catch(() => undefined);
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
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}
