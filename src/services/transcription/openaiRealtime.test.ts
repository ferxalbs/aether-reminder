import { describe, expect, test } from 'bun:test';
import {
  createOpenAIRealtimeTranscriptionSession,
  OPENAI_REALTIME_TRANSCRIPTION_MODEL,
  OPENAI_REALTIME_TRANSCRIPTION_SAMPLE_RATE,
  testOpenAIRealtimeConnection,
} from './openaiRealtime';

class FakeSocket {
  readyState = 0;
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  closeCalls: { code?: number; reason?: string }[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  message(data: unknown): void {
    this.onmessage?.({ data });
  }
}

describe('OpenAI realtime transcription transport', () => {
  test('uses the documented session, PCM append, and commit events', async () => {
    const socket = new FakeSocket();
    const received: unknown[] = [];
    let url = '';
    let key = '';
    const session = createOpenAIRealtimeTranscriptionSession('openai-key', {
      onEvent: (event) => received.push(event),
      onError: () => undefined,
      socketFactory: (socketUrl, socketKey) => {
        url = socketUrl;
        key = socketKey;
        return socket;
      },
    });

    const connected = session.connect();
    socket.open();
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: OPENAI_REALTIME_TRANSCRIPTION_SAMPLE_RATE },
            transcription: { model: OPENAI_REALTIME_TRANSCRIPTION_MODEL },
            turn_detection: null,
          },
        },
      },
    });
    socket.message(JSON.stringify({ type: 'session.updated' }));
    await connected;

    session.appendPcm16(new Uint8Array([0, 1]).buffer);
    session.commit();
    expect(JSON.parse(socket.sent[1])).toEqual({ type: 'input_audio_buffer.append', audio: 'AAE=' });
    expect(JSON.parse(socket.sent[2])).toEqual({ type: 'input_audio_buffer.commit' });
    expect(url).toContain(`model=${encodeURIComponent(OPENAI_REALTIME_TRANSCRIPTION_MODEL)}`);
    expect(key).toBe('openai-key');
    expect(received).toHaveLength(1);
  });

  test('cancellation closes the native session and prevents duplicate commit sends', async () => {
    const socket = new FakeSocket();
    const session = createOpenAIRealtimeTranscriptionSession('openai-key', {
      onEvent: () => undefined,
      onError: () => undefined,
      socketFactory: () => socket,
    });
    const connected = session.connect();
    socket.open();
    socket.message(JSON.stringify({ type: 'session.updated' }));
    await connected;
    session.cancel();
    session.cancel();
    expect(socket.closeCalls).toEqual([{ code: 1000, reason: 'cancelled' }]);
    expect(() => session.commit()).toThrow();
  });

  test('connection validation and transport are OpenAI-only', async () => {
    const originalFetch = globalThis.fetch;
    let requestUrl = '';
    let authorization = '';
    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input);
      authorization = new Headers(init?.headers).get('Authorization') ?? '';
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    try {
      await expect(testOpenAIRealtimeConnection('openai-key')).resolves.toEqual({ provider: 'OpenAI', connected: true });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(requestUrl).toContain('/v1/models/gpt-realtime-whisper');
    expect(requestUrl).not.toContain('openrouter');
    expect(authorization).toBe('Bearer openai-key');
  });

  test('aggregates capture chunks into truthful 100 ms transport packets', async () => {
    const socket = new FakeSocket();
    const session = createOpenAIRealtimeTranscriptionSession('openai-key', {
      onEvent: () => undefined,
      onError: () => undefined,
      socketFactory: () => socket,
      transportPaceMs: 1,
    });
    const connected = session.connect();
    socket.open(); socket.message(JSON.stringify({ type: 'session.updated' })); await connected;
    session.appendPcm16(new Uint8Array(2400).buffer);
    await new Promise((resolve) => setTimeout(resolve, 2));
    expect(socket.sent.filter((item) => JSON.parse(item).type === 'input_audio_buffer.append')).toHaveLength(0);
    session.appendPcm16(new Uint8Array(2400).buffer);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const appends = socket.sent.map((item) => JSON.parse(item)).filter((item) => item.type === 'input_audio_buffer.append');
    expect(appends).toHaveLength(1);
    expect(appends[0].audio).toHaveLength(6400);
    session.close();
  });

  test('bounds queued audio during sustained socket congestion and cleans up', async () => {
    const socket = new FakeSocket();
    socket.bufferedAmount = 20_000;
    const errors: string[] = [];
    const session = createOpenAIRealtimeTranscriptionSession('openai-key', {
      onEvent: () => undefined,
      onError: (error) => errors.push(error.message),
      socketFactory: () => socket,
      maxQueuedPackets: 2,
      maxSocketBufferedBytes: 4_800,
      transportPaceMs: 1,
    });
    const connected = session.connect();
    socket.open(); socket.message(JSON.stringify({ type: 'session.updated' })); await connected;
    session.appendPcm16(new Uint8Array(4_800).buffer);
    await new Promise((resolve) => setTimeout(resolve, 3));
    session.appendPcm16(new Uint8Array(4_800).buffer);
    await new Promise((resolve) => setTimeout(resolve, 3));
    session.appendPcm16(new Uint8Array(4_800).buffer);
    expect(errors[0]).toContain('could not keep up');
    expect(socket.closeCalls.at(-1)?.reason).toBe('realtime session failed');
  });

  test('times out connection and releases the socket', async () => {
    const socket = new FakeSocket();
    const session = createOpenAIRealtimeTranscriptionSession('openai-key', {
      onEvent: () => undefined,
      onError: () => undefined,
      socketFactory: () => socket,
      connectionTimeoutMs: 2,
    });
    await expect(session.connect()).rejects.toThrow('timed out');
    expect(socket.closeCalls.at(-1)?.reason).toBe('realtime session failed');
  });

  test('times out an inactive connected session and final transcript wait', async () => {
    for (const phase of ['session', 'final'] as const) {
      const socket = new FakeSocket();
      const errors: string[] = [];
      const session = createOpenAIRealtimeTranscriptionSession('openai-key', {
        onEvent: () => undefined,
        onError: (error) => errors.push(error.message),
        socketFactory: () => socket,
        sessionTimeoutMs: phase === 'session' ? 2 : 100,
        finalTranscriptTimeoutMs: 2,
      });
      const connected = session.connect();
      socket.open(); socket.message(JSON.stringify({ type: 'session.updated' })); await connected;
      if (phase === 'final') session.commit();
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(errors[0]).toContain('timed out');
      expect(socket.closeCalls.at(-1)?.reason).toBe('realtime session failed');
    }
  });
});
