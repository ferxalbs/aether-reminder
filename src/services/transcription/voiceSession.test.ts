import { describe, expect, test } from "bun:test";
import type { NativePcmBuffer } from "./audio";
import { createOwnedAudioSession } from "./audioSessionLease";
import {
  DevelopmentVoiceDiagnostics,
  type VoiceDiagnosticRecord,
} from "./diagnostics";
import { VoiceError } from "./errors";
import { VoiceSession, type VoiceSessionDependencies } from "./voiceSession";
import {
  defaultRealtimeTranscriptionConfig,
  type RealtimeTransportEvent,
  type RealtimeTransportListener,
} from "./types";

function pcm(samples: number[] = [1, 2, 3, 4]): ArrayBuffer {
  const data = new ArrayBuffer(samples.length * 2);
  const view = new DataView(data);
  samples.forEach((sample, index) => view.setInt16(index * 2, sample, true));
  return data;
}

class FakeCapture {
  starts = 0;
  stops = 0;
  listener: ((buffer: NativePcmBuffer) => void) | null = null;
  async start(listener: (buffer: NativePcmBuffer) => void): Promise<void> {
    this.starts += 1;
    this.listener = listener;
  }
  async stop(): Promise<void> {
    this.stops += 1;
    this.listener = null;
  }
  emit(data = pcm(), sampleRate = 24000, channels = 1): void {
    this.listener?.({ data, sampleRate, channels, timestamp: 0 });
  }
}

class FakeTransport {
  listeners = new Set<RealtimeTransportListener>();
  appends: ArrayBuffer[] = [];
  commits = 0;
  cancels = 0;
  closes = 0;
  async connect(): Promise<void> {}
  async configure(): Promise<void> {}
  appendPcm(data: ArrayBuffer): void {
    this.appends.push(data);
  }
  commit(): void {
    this.commits += 1;
  }
  cancel(): void {
    this.cancels += 1;
  }
  close(): void {
    this.closes += 1;
  }
  subscribe(listener: RealtimeTransportListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event: RealtimeTransportEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function harness(overrides: Partial<VoiceSessionDependencies> = {}) {
  const capture = new FakeCapture();
  const transports: FakeTransport[] = [];
  const cleanup: string[] = [];
  const transcripts: string[] = [];
  const dependencies: VoiceSessionDependencies = {
    permission: {
      get: async () => ({
        granted: true,
        canAskAgain: true,
        status: "granted",
      }),
      request: async () => ({
        granted: true,
        canAskAgain: true,
        status: "granted",
      }),
    },
    audioSession: {
      activate: async () => {
        cleanup.push("activate");
      },
      deactivate: async () => {
        cleanup.push("deactivate");
      },
    },
    capture,
    clientSecrets: {
      create: async () => ({
        value: "ephemeral",
        expiresAt: Date.now() / 1000 + 60,
        modelAccess: "MODEL_EXISTS",
      }),
    },
    createTransport: () => {
      const transport = new FakeTransport();
      transports.push(transport);
      return transport;
    },
    config: defaultRealtimeTranscriptionConfig,
    onFinalTranscript: async (transcript) => {
      transcripts.push(transcript);
    },
    ...overrides,
  };
  const session = new VoiceSession(dependencies);
  return { session, capture, transports, cleanup, transcripts };
}

async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("VoiceSession orchestration", () => {
  test("checks permission, activates audio, starts native PCM, and reaches listening", async () => {
    const h = harness();
    await h.session.start();
    expect(h.session.snapshot).toMatchObject({
      state: "listening",
      permission: "granted",
      error: null,
    });
    expect(h.capture.starts).toBe(1);
    expect(h.cleanup).toEqual(["activate"]);
  });

  test("enters explicit permission_denied when permission is permanently blocked", async () => {
    const h = harness({
      permission: {
        get: async () => ({
          granted: false,
          canAskAgain: false,
          status: "denied",
        }),
        request: async () => ({
          granted: false,
          canAskAgain: false,
          status: "denied",
        }),
      },
    });
    await h.session.start();
    expect(h.session.snapshot).toMatchObject({
      state: "permission_denied",
      permission: "blocked",
    });
    expect(h.session.snapshot.error?.code).toBe("MIC_PERMISSION_BLOCKED");
    expect(h.capture.starts).toBe(0);
  });

  test("streams normalized PCM, reconciles deltas, and commits manually once", async () => {
    const h = harness();
    await h.session.start();
    h.capture.emit();
    h.transports[0].emit({
      type: "speechDelta",
      itemId: "item-1",
      delta: "Remind ",
    });
    h.transports[0].emit({
      type: "speechDelta",
      itemId: "item-1",
      delta: "me",
    });
    expect(h.session.snapshot.partialTranscript).toBe("Remind me");
    await h.session.stop();
    await h.session.stop();
    expect(h.transports[0].appends).toHaveLength(1);
    expect(h.transports[0].commits).toBe(1);
    expect(h.session.snapshot.state).toBe("finalizing");
  });

  test("flushes preconnect PCM in order before live packets that arrive during the handoff", async () => {
    const first = pcm([1]);
    const duringFlush = pcm([2]);
    let releaseSecret = () => undefined;
    const secretGate = new Promise<void>((resolve) => {
      releaseSecret = resolve;
    });
    const h = harness({
      clientSecrets: {
        create: async () => {
          await secretGate;
          return {
            value: "ephemeral",
            expiresAt: Date.now() / 1000 + 60,
            modelAccess: "MODEL_EXISTS",
          };
        },
      },
      createTransport: () => {
        const transport = new FakeTransport();
        const original = transport.appendPcm.bind(transport);
        transport.appendPcm = (data: ArrayBuffer) => {
          original(data);
          if (transport.appends.length === 1) h.capture.emit(duringFlush);
        };
        h.transports.push(transport);
        return transport;
      },
    });
    const starting = h.session.start();
    await tick();
    h.capture.emit(first);
    releaseSecret();
    await starting;
    expect(h.session.snapshot.state).toBe("listening");
    expect(
      h.transports[0].appends.map((buffer) => [...new Uint8Array(buffer)]),
    ).toEqual([[...new Uint8Array(first)], [...new Uint8Array(duringFlush)]]);
  });

  test("fails instead of dropping audio when the pre-connect buffer is full", async () => {
    let releaseSecret = () => undefined;
    const secretGate = new Promise<void>((resolve) => {
      releaseSecret = resolve;
    });
    const h = harness({
      maxPreconnectBytes: 2,
      clientSecrets: {
        create: async () => {
          await secretGate;
          return {
            value: "ephemeral",
            expiresAt: Date.now() / 1000 + 60,
            modelAccess: "MODEL_EXISTS",
          };
        },
      },
    });
    const starting = h.session.start();
    await tick();
    h.capture.emit(pcm([1, 2, 3, 4]));
    await tick();
    expect(h.session.snapshot.state).toBe("connection_failed");
    expect(h.session.snapshot.error?.code).toBe("REALTIME_BACKPRESSURE");
    expect(h.capture.stops).toBe(1);
    releaseSecret();
    await starting;
  });

  test("uses only the exact completed transcript for the parser handoff", async () => {
    const h = harness();
    await h.session.start();
    h.capture.emit();
    await h.session.stop();
    h.transports[0].emit({
      type: "completed",
      itemId: "final-item",
      transcript: " Remind me tomorrow at nine to review the report ",
    });
    h.transports[0].emit({
      type: "completed",
      itemId: "final-item",
      transcript: "duplicate completion must not be handed off",
    });
    await tick();
    expect(h.transcripts).toEqual([
      " Remind me tomorrow at nine to review the report ",
    ]);
    expect(h.session.snapshot).toMatchObject({
      state: "review",
      activeItemId: "final-item",
      finalTranscript: " Remind me tomorrow at nine to review the report ",
    });
  });

  test("development diagnostics record PCM, one parser handoff, and cleanup without transcript text", async () => {
    const records: VoiceDiagnosticRecord[] = [];
    const h = harness({
      createDiagnostics: () =>
        new DevelopmentVoiceDiagnostics({
          enabled: true,
          sink: (record) => records.push(record),
        }),
    });
    await h.session.start();
    h.capture.emit(pcm([1, 2, 3, 4]), 48000, 1);
    await h.session.stop();
    h.transports[0].emit({
      type: "completed",
      itemId: "private-item-id",
      transcript: "Sensitive spoken reminder text",
    });
    await tick();
    expect(records).toContainEqual(
      expect.objectContaining({
        stage: "audio_format_detected",
        actualSampleRate: 48000,
        channelCount: 1,
        resamplingActive: true,
      }),
    );
    expect(records.at(-1)).toMatchObject({
      stage: "session_summary",
      parserHandoffCount: 1,
      cleanupCompleted: true,
      terminalState: "review",
    });
    expect(JSON.stringify(records)).not.toContain(
      "Sensitive spoken reminder text",
    );
    expect(JSON.stringify(records)).not.toContain("private-item-id");
  });

  test("classifies an empty completed transcript without invoking parsing", async () => {
    const h = harness();
    await h.session.start();
    h.capture.emit();
    await h.session.stop();
    h.transports[0].emit({
      type: "completed",
      itemId: "empty",
      transcript: "   ",
    });
    await tick();
    expect(h.session.snapshot.state).toBe("transcription_failed");
    expect(h.session.snapshot.error?.code).toBe("EMPTY_TRANSCRIPT");
    expect(h.transcripts).toEqual([]);
  });

  test("classifies transcription failure and connection loss separately", async () => {
    const transcription = harness();
    await transcription.session.start();
    transcription.transports[0].emit({
      type: "failed",
      error: new VoiceError("TRANSCRIPTION_FAILED", "provider failed"),
    });
    await tick();
    expect(transcription.session.snapshot.state).toBe("transcription_failed");

    const connection = harness();
    await connection.session.start();
    connection.transports[0].emit({
      type: "failed",
      error: new VoiceError("REALTIME_CONNECTION_LOST", "offline"),
    });
    await tick();
    expect(connection.session.snapshot.state).toBe("connection_failed");
  });

  test("retry creates a new session after transient authentication failure", async () => {
    let attempts = 0;
    const h = harness({
      clientSecrets: {
        create: async () => {
          attempts += 1;
          if (attempts === 1)
            throw new VoiceError("REALTIME_AUTH_FAILED", "temporary");
          return {
            value: "ephemeral",
            expiresAt: Date.now() / 1000 + 60,
            modelAccess: "MODEL_EXISTS",
          };
        },
      },
    });
    await h.session.start();
    expect(h.session.snapshot.state).toBe("connection_failed");
    await h.session.retry();
    expect(h.session.snapshot.state).toBe("listening");
    expect(attempts).toBe(2);
  });

  test("cancel is idempotent and rapid cancel-reopen acquires fresh resources", async () => {
    const h = harness();
    await h.session.start();
    await h.session.cancel();
    await h.session.cancel();
    expect(h.session.snapshot.state).toBe("idle");
    expect(h.capture.stops).toBe(1);
    await h.session.start();
    expect(h.session.snapshot.state).toBe("listening");
    expect(h.capture.starts).toBe(2);
  });

  test("cancel during audio-session activation cannot leak microphone ownership", async () => {
    let releaseActivation = () => undefined;
    const activationGate = new Promise<void>((resolve) => {
      releaseActivation = resolve;
    });
    let audioModeCalls = 0;
    const audioSession = createOwnedAudioSession(async () => {
      audioModeCalls += 1;
      if (audioModeCalls === 1) await activationGate;
    });
    const h = harness({ audioSession });

    const starting = h.session.start();
    await tick();
    const cancelling = h.session.cancel();
    releaseActivation();
    await Promise.all([starting, cancelling]);
    expect(h.session.snapshot.state).toBe("idle");

    await h.session.start();
    expect(h.session.snapshot.state).toBe("listening");
    await h.session.cancel();
  });

  test("app-background cancellation semantics release capture, transport, and audio session", async () => {
    const h = harness();
    await h.session.start();
    await h.session.cancel();
    expect(h.capture.stops).toBe(1);
    expect(h.transports[0].cancels).toBe(1);
    expect(h.cleanup).toEqual(["activate", "deactivate"]);
  });

  test("unexpected native stream interruption enters capture_failed and cleans up", async () => {
    const h = harness();
    await h.session.start();
    await h.session.captureInterrupted(new Error("permission revoked"));
    expect(h.session.snapshot.state).toBe("capture_failed");
    expect(h.session.snapshot.error?.code).toBe("AUDIO_STREAM_START_FAILED");
    expect(h.session.snapshot.error?.cause).toBeInstanceOf(Error);
    expect(h.capture.stops).toBe(1);
    expect(h.transports[0].cancels).toBe(1);
    expect(h.cleanup.at(-1)).toBe("deactivate");
  });

  test("cleanup runs after a transport error", async () => {
    const h = harness();
    await h.session.start();
    h.transports[0].emit({
      type: "failed",
      error: new VoiceError("REALTIME_CONNECTION_LOST", "dropped"),
    });
    await tick();
    expect(h.capture.stops).toBe(1);
    expect(h.cleanup.at(-1)).toBe("deactivate");
  });

  test("parser rejection enters parsing_failed after final transcript", async () => {
    const h = harness({
      onFinalTranscript: async () => {
        throw new Error("parser unavailable");
      },
    });
    await h.session.start();
    h.capture.emit();
    await h.session.stop();
    h.transports[0].emit({
      type: "completed",
      itemId: "item",
      transcript: "Create reminder",
    });
    await tick();
    expect(h.session.snapshot.state).toBe("parsing_failed");
    expect(h.session.snapshot.error?.cause).toBeInstanceOf(Error);
  });
});
