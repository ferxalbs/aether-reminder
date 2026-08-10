import { describe, expect, test } from 'bun:test';
import { DevelopmentVoiceDiagnostics, type VoiceDiagnosticRecord } from './diagnostics';
import { OpenAIRealtimeWebSocketTransport } from './openaiRealtimeTransport';
import { defaultRealtimeTranscriptionConfig } from './types';

class FakeSocket {
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  closes: { code?: number; reason?: string }[] = [];
  send(data: string): void { this.sent.push(data); }
  close(code?: number, reason?: string): void { this.closes.push({ code, reason }); }
  open(): void { this.onopen?.(); }
  message(event: unknown): void { this.onmessage?.({ data: JSON.stringify(event) }); }
  drop(): void { this.onclose?.(); }
}

async function connectedTransport(socket: FakeSocket, diagnostics?: DevelopmentVoiceDiagnostics) {
  const events: unknown[] = [];
  let credential = '';
  const transport = new OpenAIRealtimeWebSocketTransport({
    model: defaultRealtimeTranscriptionConfig.model,
    packetBytes: 2,
    diagnostics,
    socketFactory: (_url, secret) => { credential = secret; return socket; },
  });
  transport.subscribe((event) => events.push(event));
  const connecting = transport.connect('ephemeral-secret');
  socket.open();
  await connecting;
  const configuring = transport.configure(defaultRealtimeTranscriptionConfig);
  socket.message({ type: 'session.updated' });
  await configuring;
  return { transport, events, credential };
}

async function drainMicrotasks(count = 8): Promise<void> {
  for (let index = 0; index < count; index += 1) await Promise.resolve();
}

describe('OpenAI Realtime WebSocket transport', () => {
  test('authenticates with the ephemeral secret and configures manual 24 kHz transcription', async () => {
    const socket = new FakeSocket();
    const { credential } = await connectedTransport(socket);
    expect(credential).toBe('ephemeral-secret');
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            transcription: {
              model: 'gpt-live-transcribe',
              prompt: defaultRealtimeTranscriptionConfig.context.prompt,
              languages: ['en', 'es'],
            },
            turn_detection: null,
          },
        },
      },
    });
  });

  test('preserves append ordering and sends manual commit only after pending PCM', async () => {
    const socket = new FakeSocket();
    const { transport } = await connectedTransport(socket);
    transport.appendPcm(new Uint8Array([0, 1, 2, 3]).buffer);
    transport.commit();
    await drainMicrotasks();
    expect(socket.sent.slice(1).map((value) => JSON.parse(value).type)).toEqual([
      'input_audio_buffer.append',
      'input_audio_buffer.append',
      'input_audio_buffer.commit',
    ]);
    expect(JSON.parse(socket.sent[1]).audio).toBe('AAE=');
    expect(JSON.parse(socket.sent[2]).audio).toBe('AgM=');
  });

  test('emits deltas and authoritative completion with item ids', async () => {
    const socket = new FakeSocket();
    const { events } = await connectedTransport(socket);
    socket.message({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'a', delta: 'Hi' });
    socket.message({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'a', transcript: 'Hi there' });
    expect(events).toContainEqual({ type: 'speechDelta', itemId: 'a', delta: 'Hi' });
    expect(events).toContainEqual({ type: 'completed', itemId: 'a', transcript: 'Hi there' });
  });

  test('classifies transcription failure and connection drop explicitly', async () => {
    const failedSocket = new FakeSocket();
    const failed = await connectedTransport(failedSocket);
    failedSocket.message({
      type: 'conversation.item.input_audio_transcription.failed',
      error: { message: 'bad audio' },
    });
    expect(failed.events).toContainEqual(expect.objectContaining({
      type: 'failed',
      error: expect.objectContaining({ code: 'TRANSCRIPTION_FAILED' }),
    }));

    const droppedSocket = new FakeSocket();
    const dropped = await connectedTransport(droppedSocket);
    droppedSocket.drop();
    expect(dropped.events).toContainEqual(expect.objectContaining({
      type: 'failed',
      error: expect.objectContaining({ code: 'REALTIME_CONNECTION_LOST' }),
    }));
  });

  test('cancel is idempotent, clears buffered audio, and closes once', async () => {
    const socket = new FakeSocket();
    const { transport } = await connectedTransport(socket);
    transport.cancel();
    transport.cancel();
    expect(JSON.parse(socket.sent.at(-1) ?? '{}')).toEqual({ type: 'input_audio_buffer.clear' });
    expect(socket.closes).toEqual([{ code: 1000, reason: 'cancelled' }]);
  });

  test('reports safe WebSocket, configuration, append, commit, and transcript counters', async () => {
    const records: VoiceDiagnosticRecord[] = [];
    const diagnostics = new DevelopmentVoiceDiagnostics({
      enabled: true,
      sink: (record) => records.push(record),
    });
    const socket = new FakeSocket();
    const { transport } = await connectedTransport(socket, diagnostics);
    transport.appendPcm(new Uint8Array([0, 1]).buffer);
    transport.commit();
    await drainMicrotasks();
    socket.message({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'sensitive-item',
      delta: 'Sensitive partial text',
    });
    socket.message({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'sensitive-item',
      transcript: 'Sensitive final text',
    });
    transport.close();

    expect(records.map((record) => record.stage)).toEqual(expect.arrayContaining([
      'websocket_connecting',
      'websocket_open',
      'session_configuration_sent',
      'session_configuration_accepted',
      'audio_append_progress',
      'commit_sent',
      'transcription_delta_progress',
      'transcription_completed',
      'websocket_closed',
    ]));
    expect(records.find((record) => record.stage === 'commit_sent')).toMatchObject({
      audioAppendCount: 1,
      commitSent: true,
    });
    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain('ephemeral-secret');
    expect(serialized).not.toContain('Sensitive partial text');
    expect(serialized).not.toContain('Sensitive final text');
    expect(serialized).not.toContain('sensitive-item');
  });
});
