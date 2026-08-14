import { describe, expect, test } from 'bun:test';
import {
  DevelopmentVoiceDiagnostics,
  type VoiceDiagnosticRecord,
} from './diagnostics';
import {
  OpenAIRealtimeWebSocketTransport,
  type OpenAIRealtimeWebSocketTransportOptions,
  type RealtimeWebSocketLike,
} from './openaiRealtimeWebSocketTransport';
import { defaultRealtimeTranscriptionConfig } from './types';

class FakeWebSocket implements RealtimeWebSocketLike {
  readonly sent: string[] = [];
  readyState = 0;
  bufferedAmount = 0;
  closeCount = 0;
  onopen: ((event?: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;
  onclose: ((event?: unknown) => void) | null = null;

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(event: unknown): void {
    this.onmessage?.({ data: JSON.stringify(event) });
  }

  disconnect(): void {
    this.readyState = 3;
    this.onclose?.({});
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCount += 1;
    this.readyState = 3;
    this.onclose?.({});
  }
}

interface Harness {
  transport: OpenAIRealtimeWebSocketTransport;
  socket: FakeWebSocket;
  url: string;
  protocols: string[];
  events: { type: string; [key: string]: unknown }[];
  records: VoiceDiagnosticRecord[];
}

function harness(options: OpenAIRealtimeWebSocketTransportOptions = {}): Harness {
  const socket = new FakeWebSocket();
  let url = '';
  let protocols: string[] = [];
  const events: { type: string; [key: string]: unknown }[] = [];
  const records: VoiceDiagnosticRecord[] = [];
  const diagnostics = new DevelopmentVoiceDiagnostics({
    enabled: true,
    sink: (record) => records.push(record),
  });
  const transport = new OpenAIRealtimeWebSocketTransport({
    ...options,
    diagnostics,
    packetBytes: options.packetBytes ?? 4,
    webSocketFactory: (nextUrl, nextProtocols) => {
      url = nextUrl;
      protocols = nextProtocols;
      return socket;
    },
  });
  transport.subscribe((event) => events.push(event as { type: string; [key: string]: unknown }));
  return {
    transport,
    socket,
    get url() { return url; },
    get protocols() { return protocols; },
    events,
    records,
  };
}

async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function connectedAndConfigured(h: Harness): Promise<void> {
  const connecting = h.transport.connect('ephemeral-secret');
  h.socket.open();
  await connecting;

  const configuring = h.transport.configure(defaultRealtimeTranscriptionConfig);
  h.socket.receive({ type: 'session.created', session: { type: 'transcription' } });
  h.socket.receive({ type: 'session.updated', session: { type: 'transcription' } });
  await configuring;
}

function parsedMessages(h: Harness): Record<string, unknown>[] {
  return h.socket.sent.map((message) => JSON.parse(message) as Record<string, unknown>);
}

function pcm(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

describe('OpenAI Realtime WebSocket transport', () => {
  test('uses the ephemeral WebSocket subprotocol and opens the current endpoint', async () => {
    const h = harness();
    const connecting = h.transport.connect('ephemeral-secret');
    h.socket.open();
    await connecting;

    expect(h.url).toBe('wss://api.openai.com/v1/realtime?model=gpt-live-transcribe');
    expect(h.protocols).toEqual(['realtime', 'openai-insecure-api-key.ephemeral-secret']);
    expect(h.events).toContainEqual({ type: 'connected' });
    expect(h.records).toContainEqual(expect.objectContaining({
      stage: 'websocket_open',
      webSocketState: 'open',
    }));
    h.transport.close();
  });

  test('sends the exact current transcription session configuration', async () => {
    const h = harness();
    await connectedAndConfigured(h);
    const [message] = parsedMessages(h);
    expect(message).toEqual({
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            transcription: {
              model: 'gpt-live-transcribe',
              languages: ['en', 'es'],
              prompt: defaultRealtimeTranscriptionConfig.context.prompt,
            },
            turn_detection: null,
          },
        },
      },
    });
    expect(h.records).toContainEqual(expect.objectContaining({
      stage: 'session_configuration_accepted',
      sessionConfiguration: 'accepted',
    }));
    h.transport.close();
  });

  test('rejects append before ready and rejects odd-byte PCM without truncation', async () => {
    const h = harness();
    const beforeReady = (() => {
      try {
        h.transport.appendPcm(pcm([0, 1]));
        return null;
      } catch (error) {
        return error;
      }
    })();
    expect(beforeReady).toMatchObject({ code: 'REALTIME_PROTOCOL_ERROR' });

    await connectedAndConfigured(h);
    const odd = (() => {
      try {
        h.transport.appendPcm(pcm([0]));
        return null;
      } catch (error) {
        return error;
      }
    })();
    expect(odd).toMatchObject({ code: 'AUDIO_FORMAT_UNSUPPORTED' });
    expect(h.socket.sent).toHaveLength(1);
    h.transport.close();
  });

  test('preserves packet boundaries, Base64 bytes, ordering, and manual commit', async () => {
    const h = harness({ packetBytes: 4 });
    await connectedAndConfigured(h);

    h.transport.appendPcm(pcm([0, 1]));
    await tick();
    expect(parsedMessages(h)).toHaveLength(1);

    h.transport.appendPcm(pcm([2, 3, 4, 5]));
    h.transport.commit();
    await tick();

    expect(parsedMessages(h).slice(1)).toEqual([
      { type: 'input_audio_buffer.append', audio: 'AAECAw==' },
      { type: 'input_audio_buffer.append', audio: 'BAU=' },
      { type: 'input_audio_buffer.commit' },
    ]);
    expect(h.records).toContainEqual(expect.objectContaining({
      stage: 'commit_sent',
      audioAppendCount: 2,
      audioBytesSubmitted: 6,
      commitSent: true,
    }));
    expect(h.transport.currentState).toBe('finalizing');
  });

  test('fails explicitly when the bounded packet queue is exceeded', async () => {
    const h = harness({ maxQueuedPackets: 1 });
    await connectedAndConfigured(h);
    h.transport.appendPcm(pcm([0, 1, 2, 3]));
    const failure = (() => {
      try {
        h.transport.appendPcm(pcm([4, 5, 6, 7]));
        return null;
      } catch (error) {
        return error;
      }
    })();
    expect(failure).toMatchObject({ code: 'REALTIME_BACKPRESSURE' });
    expect(h.events).toContainEqual(expect.objectContaining({
      type: 'failed',
      error: expect.objectContaining({ code: 'REALTIME_BACKPRESSURE' }),
    }));
  });

  test('fails explicitly when WebSocket buffered bytes do not drain', async () => {
    const h = harness({ backpressureTimeoutMs: 5, backpressurePollMs: 1, maxWebSocketBufferedBytes: 2 });
    await connectedAndConfigured(h);
    h.socket.bufferedAmount = 100;
    h.transport.appendPcm(pcm([0, 1, 2, 3]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(h.events).toContainEqual(expect.objectContaining({
      type: 'failed',
      error: expect.objectContaining({ code: 'REALTIME_BACKPRESSURE' }),
    }));
  });

  test('reconciles official delta and completed events, using completion as authority', async () => {
    const h = harness();
    await connectedAndConfigured(h);
    h.transport.appendPcm(pcm([0, 1, 2, 3]));
    h.transport.commit();
    await tick();
    h.socket.receive({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'item-1',
      content_index: 0,
      delta: 'Remind ',
    });
    h.socket.receive({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'item-1',
      content_index: 0,
      delta: 'me',
    });
    h.socket.receive({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item-1',
      content_index: 0,
      transcript: 'Remind me tomorrow',
    });
    h.socket.receive({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item-1',
      content_index: 0,
      transcript: 'duplicate must be ignored',
    });
    expect(h.events.filter((event) => event.type === 'speechDelta')).toHaveLength(2);
    expect(h.events.filter((event) => event.type === 'completed')).toEqual([{
      type: 'completed',
      itemId: 'item-1',
      transcript: 'Remind me tomorrow',
    }]);
    expect(h.records).toContainEqual(expect.objectContaining({
      stage: 'transcription_completed',
      transcriptionCompleted: true,
    }));
  });

  test('maps transcription failures and generic provider errors to typed failures', async () => {
    const transcription = harness();
    await connectedAndConfigured(transcription);
    transcription.transport.appendPcm(pcm([0, 1, 2, 3]));
    transcription.transport.commit();
    await tick();
    transcription.socket.receive({
      type: 'conversation.item.input_audio_transcription.failed',
      item_id: 'item-1',
      error: { type: 'transcription_error', code: 'audio_unusable', message: 'Audio was unusable.' },
    });
    expect(transcription.events).toContainEqual(expect.objectContaining({
      type: 'failed',
      error: expect.objectContaining({ code: 'TRANSCRIPTION_FAILED' }),
    }));

    const configuration = harness();
    await connectedAndConfigured(configuration);
    configuration.socket.receive({
      type: 'error',
      event_id: 'evt-1',
      error: {
        type: 'invalid_request_error',
        code: 'invalid_request_error',
        message: 'Invalid session configuration.',
        param: 'session.audio.input',
      },
    });
    expect(configuration.events).toContainEqual(expect.objectContaining({
      type: 'failed',
      error: expect.objectContaining({ code: 'SESSION_CONFIGURATION_INVALID' }),
    }));
  });

  test('fails malformed contract events but ignores unknown harmless events', async () => {
    const h = harness();
    await connectedAndConfigured(h);
    h.socket.receive({ type: 'rate_limits.updated', rate_limits: [] });
    expect(h.events.filter((event) => event.type === 'failed')).toHaveLength(0);
    h.transport.appendPcm(pcm([0, 1, 2, 3]));
    h.transport.commit();
    await tick();
    h.socket.receive({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'item-1',
      content_index: 0,
    });
    expect(h.events).toContainEqual(expect.objectContaining({
      type: 'failed',
      error: expect.objectContaining({ code: 'REALTIME_PROTOCOL_ERROR' }),
    }));
  });

  test('distinguishes an unexpected close from deterministic cancellation', async () => {
    const unexpected = harness();
    await connectedAndConfigured(unexpected);
    unexpected.socket.disconnect();
    expect(unexpected.events).toContainEqual({ type: 'closed', expected: false });
    expect(unexpected.events).toContainEqual(expect.objectContaining({
      type: 'failed',
      error: expect.objectContaining({ code: 'REALTIME_CONNECTION_LOST' }),
    }));

    const cancelled = harness();
    await connectedAndConfigured(cancelled);
    cancelled.transport.appendPcm(pcm([0, 1, 2, 3]));
    cancelled.transport.cancel();
    cancelled.transport.cancel();
    expect(cancelled.socket.sent).toContain(JSON.stringify({ type: 'input_audio_buffer.clear' }));
    expect(cancelled.socket.closeCount).toBe(1);
    expect(cancelled.events.filter((event) => event.type === 'closed')).toEqual([
      { type: 'closed', expected: true },
    ]);
    const eventCount = cancelled.events.length;
    cancelled.socket.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'stale', transcript: 'stale' });
    expect(cancelled.events).toHaveLength(eventCount);
    expect(cancelled.transport.currentState).toBe('closed');
  });

  test('times out connection and configuration separately and cleans timers on close', async () => {
    const connection = harness({ connectionTimeoutMs: 5 });
    const connecting = connection.transport.connect('ephemeral-secret');
    await expect(connecting).rejects.toMatchObject({ code: 'REALTIME_TIMEOUT' });
    expect(connection.transport.currentState).toBe('failed');

    const configuration = harness({ configurationTimeoutMs: 5 });
    const opened = configuration.transport.connect('ephemeral-secret');
    configuration.socket.open();
    await opened;
    const configuring = configuration.transport.configure(defaultRealtimeTranscriptionConfig);
    await expect(configuring).rejects.toMatchObject({ code: 'REALTIME_TIMEOUT' });
    expect(configuration.transport.currentState).toBe('failed');

    const clean = harness();
    await connectedAndConfigured(clean);
    clean.transport.close();
    clean.transport.close();
    expect(clean.socket.closeCount).toBe(1);
    expect(clean.records.filter((record) => record.stage === 'websocket_closed')).toHaveLength(1);
  });

  test('never places credentials, PCM, item ids, or transcript text in diagnostics', async () => {
    const h = harness();
    await connectedAndConfigured(h);
    h.transport.appendPcm(pcm([0, 1, 2, 3]));
    h.transport.commit();
    await tick();
    h.socket.receive({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'private-item-id',
      content_index: 0,
      transcript: 'Sensitive spoken reminder text',
    });
    const serialized = JSON.stringify(h.records);
    expect(serialized).not.toContain('ephemeral-secret');
    expect(serialized).not.toContain('private-item-id');
    expect(serialized).not.toContain('Sensitive spoken reminder text');
    expect(serialized).not.toContain('AAECAw==');
  });
});
