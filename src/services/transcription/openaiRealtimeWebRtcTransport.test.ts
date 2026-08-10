import { describe, expect, test } from 'bun:test';
import { DevelopmentVoiceDiagnostics, type VoiceDiagnosticRecord } from './diagnostics';
import {
  OpenAIRealtimeWebRtcTransport,
  type RealtimePeerConnectionFactory,
} from './openaiRealtimeWebRtcTransport';
import { defaultRealtimeTranscriptionConfig } from './types';

class FakeDataChannel {
  bufferedAmount = 0;
  readyState = 'connecting';
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  closeCount = 0;
  send(data: string): void { this.sent.push(data); }
  close(): void { this.closeCount += 1; this.readyState = 'closed'; }
  open(): void { this.readyState = 'open'; this.onopen?.(); }
  message(event: unknown): void { this.onmessage?.({ data: JSON.stringify(event) }); }
  drop(): void { this.readyState = 'closed'; this.onclose?.(); }
}

class FakePeerConnection {
  localDescription: { sdp: string } | null = null;
  connectionState = 'new';
  onconnectionstatechange: (() => void) | null = null;
  closed = 0;
  remoteDescription: { type: 'offer' | 'answer'; sdp: string } | null = null;
  constructor(readonly channel: FakeDataChannel) {}
  createDataChannel(label: string): FakeDataChannel {
    expect(label).toBe('oai-events');
    return this.channel;
  }
  async createOffer() { return { type: 'offer' as const, sdp: 'local-offer-sdp' }; }
  async setLocalDescription(description: { type: 'offer' | 'answer'; sdp: string }) {
    this.localDescription = description;
  }
  async setRemoteDescription(description: { type: 'offer' | 'answer'; sdp: string }) {
    this.remoteDescription = description;
    this.connectionState = 'connected';
    this.onconnectionstatechange?.();
    this.channel.open();
  }
  close(): void { this.closed += 1; this.connectionState = 'closed'; }
}

interface CallCapture {
  url?: string;
  init?: RequestInit;
}

async function connectedTransport(diagnostics?: DevelopmentVoiceDiagnostics) {
  const events: unknown[] = [];
  const channel = new FakeDataChannel();
  const peer = new FakePeerConnection(channel);
  const call: CallCapture = {};
  const transport = new OpenAIRealtimeWebRtcTransport({
    packetBytes: 2,
    diagnostics,
    peerConnectionFactory: (() => peer) as RealtimePeerConnectionFactory,
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      call.url = String(url);
      call.init = init;
      return new Response('remote-answer-sdp', {
        status: 201,
        headers: { 'x-request-id': 'req_webrtc' },
      });
    }) as typeof fetch,
  });
  transport.subscribe((event) => events.push(event));
  await transport.connect('ephemeral-secret');
  const configuring = transport.configure(defaultRealtimeTranscriptionConfig);
  channel.message({ type: 'session.updated' });
  await configuring;
  return { transport, events, channel, peer, call };
}

async function drainMicrotasks(count = 8): Promise<void> {
  for (let index = 0; index < count; index += 1) await Promise.resolve();
}

describe('OpenAI Realtime WebRTC transport', () => {
  test('negotiates the GA calls endpoint with an ephemeral secret and no model query', async () => {
    const { call, peer, channel } = await connectedTransport();
    expect(call.url).toBe('https://api.openai.com/v1/realtime/calls');
    expect(call.url).not.toContain('model=');
    expect(call.init).toMatchObject({
      method: 'POST',
      body: 'local-offer-sdp',
      headers: {
        Authorization: 'Bearer ephemeral-secret',
        'Content-Type': 'application/sdp',
      },
    });
    expect(peer.remoteDescription).toEqual({ type: 'answer', sdp: 'remote-answer-sdp' });
    expect(JSON.parse(channel.sent[0])).toEqual({
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

  test('preserves append ordering and sends manual commit after pending PCM', async () => {
    const { transport, channel } = await connectedTransport();
    transport.appendPcm(new Uint8Array([0, 1, 2, 3]).buffer);
    transport.commit();
    await drainMicrotasks();
    expect(channel.sent.slice(1).map((value) => JSON.parse(value).type)).toEqual([
      'input_audio_buffer.append',
      'input_audio_buffer.append',
      'input_audio_buffer.commit',
    ]);
    expect(JSON.parse(channel.sent[1]).audio).toBe('AAE=');
    expect(JSON.parse(channel.sent[2]).audio).toBe('AgM=');
  });

  test('emits deltas and authoritative completion with item ids', async () => {
    const { channel, events } = await connectedTransport();
    channel.message({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'a', delta: 'Hi' });
    channel.message({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'a', transcript: 'Hi there' });
    expect(events).toContainEqual({ type: 'speechDelta', itemId: 'a', delta: 'Hi' });
    expect(events).toContainEqual({ type: 'completed', itemId: 'a', transcript: 'Hi there' });
  });

  test('preserves provider errors from the calls endpoint', async () => {
    const channel = new FakeDataChannel();
    const peer = new FakePeerConnection(channel);
    const events: unknown[] = [];
    const transport = new OpenAIRealtimeWebRtcTransport({
      peerConnectionFactory: (() => peer) as RealtimePeerConnectionFactory,
      fetch: (async () => new Response(JSON.stringify({
        error: { code: 'invalid_api_key', message: 'Invalid credential', type: 'authentication_error' },
      }), { status: 401, headers: { 'x-request-id': 'req_denied' } })) as typeof fetch,
    });
    transport.subscribe((event) => events.push(event));
    await expect(transport.connect('ephemeral-secret')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIAL',
      providerError: { code: 'invalid_api_key', requestId: 'req_denied' },
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'failed',
      error: expect.objectContaining({ code: 'INVALID_CREDENTIAL' }),
    }));
  });

  test('classifies transcription failure and connection drop explicitly', async () => {
    const failed = await connectedTransport();
    failed.channel.message({
      type: 'conversation.item.input_audio_transcription.failed',
      error: { message: 'bad audio' },
    });
    expect(failed.events).toContainEqual(expect.objectContaining({
      type: 'failed',
      error: expect.objectContaining({ code: 'TRANSCRIPTION_FAILED' }),
    }));

    const dropped = await connectedTransport();
    dropped.channel.drop();
    expect(dropped.events).toContainEqual(expect.objectContaining({
      type: 'failed',
      error: expect.objectContaining({ code: 'REALTIME_CONNECTION_LOST' }),
    }));
  });

  test('cancel is idempotent, clears buffered audio, and releases native transport once', async () => {
    const { transport, channel, peer } = await connectedTransport();
    transport.cancel();
    transport.cancel();
    expect(JSON.parse(channel.sent.at(-1) ?? '{}')).toEqual({ type: 'input_audio_buffer.clear' });
    expect(channel.closeCount).toBe(1);
    expect(peer.closed).toBe(1);
  });

  test('reports safe WebRTC, configuration, append, commit, and transcript counters', async () => {
    const records: VoiceDiagnosticRecord[] = [];
    const diagnostics = new DevelopmentVoiceDiagnostics({
      enabled: true,
      sink: (record) => records.push(record),
    });
    const { transport, channel } = await connectedTransport(diagnostics);
    transport.appendPcm(new Uint8Array([0, 1]).buffer);
    transport.commit();
    await drainMicrotasks();
    channel.message({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'sensitive-item',
      delta: 'Sensitive partial text',
    });
    channel.message({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'sensitive-item',
      transcript: 'Sensitive final text',
    });
    transport.close();

    expect(records.map((record) => record.stage)).toEqual(expect.arrayContaining([
      'webrtc_call_connecting',
      'webrtc_call_succeeded',
      'peer_connection_state',
      'data_channel_open',
      'session_configuration_sent',
      'session_configuration_accepted',
      'audio_append_progress',
      'commit_sent',
      'transcription_delta_progress',
      'transcription_completed',
      'data_channel_closed',
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
