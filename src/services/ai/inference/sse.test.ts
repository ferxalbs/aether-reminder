import { describe, expect, test } from 'bun:test';
import { parseSseStream } from './sse';

function streamFromString(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

describe('parseSseStream', () => {
  test('yields data payloads incrementally', async () => {
    const body = streamFromString(
      'data: {"a":1}\n\ndata: {"b":2}\n\ndata: [DONE]\n\n'
    );
    const signal = new AbortController().signal;
    const chunks: string[] = [];
    for await (const data of parseSseStream(body, signal)) {
      chunks.push(data);
    }
    expect(chunks).toEqual(['{"a":1}', '{"b":2}', '[DONE]']);
  });

  test('ignores comments and empty lines', async () => {
    const body = streamFromString(': keep-alive\n\ndata: hi\n\n');
    const chunks: string[] = [];
    for await (const data of parseSseStream(body, new AbortController().signal)) {
      chunks.push(data);
    }
    expect(chunks).toEqual(['hi']);
  });

  test('cancels a pending reader when the stream signal aborts', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const controller = new AbortController();
    const iterator = parseSseStream(body, controller.signal);
    const next = iterator.next();
    controller.abort();
    await next;
    expect(cancelled).toBe(true);
  });
});
