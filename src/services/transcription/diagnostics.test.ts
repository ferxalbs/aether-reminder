import { describe, expect, test } from 'bun:test';
import {
  DevelopmentVoiceDiagnostics,
  VOICE_DIAGNOSTIC_PREFIX,
  type VoiceDiagnosticRecord,
} from './diagnostics';

describe('development voice diagnostics', () => {
  test('emits a structured, session-scoped summary with only safe metadata', () => {
    const records: VoiceDiagnosticRecord[] = [];
    const diagnostics = new DevelopmentVoiceDiagnostics({
      enabled: true,
      sink: (record) => records.push(record),
    });
    diagnostics.record('session_started', { requestedSampleRate: 24000 });
    diagnostics.record('audio_format_detected', {
      actualSampleRate: 48000,
      channelCount: 1,
      resamplingActive: true,
    });
    diagnostics.record('pcm_progress', { pcmChunksReceived: 25, pcmBytesProduced: 24000 });
    diagnostics.record('credential_request_succeeded', {
      credentialRequest: 'succeeded',
      requestId: 'req_safe',
    });
    diagnostics.record('parser_handoff', { parserHandoffCount: 1 });
    diagnostics.record('cleanup_completed', { cleanupCompleted: true });
    diagnostics.complete({ terminalState: 'review' });
    diagnostics.complete({ terminalState: 'committed' });

    const summary = records.at(-1);
    expect(summary).toMatchObject({
      schema: 'aether.voice.diagnostic.v1',
      sessionId: diagnostics.sessionId,
      stage: 'session_summary',
      requestedSampleRate: 24000,
      actualSampleRate: 48000,
      resamplingActive: true,
      pcmChunksReceived: 25,
      pcmBytesProduced: 24000,
      credentialRequest: 'succeeded',
      requestId: 'req_safe',
      parserHandoffCount: 1,
      cleanupCompleted: true,
      terminalState: 'review',
    });
    expect(records.filter((record) => record.stage === 'session_summary')).toHaveLength(1);
    expect(JSON.stringify(records)).not.toContain('api-key');
    expect(JSON.stringify(records)).not.toContain('ephemeral-secret');
    expect(JSON.stringify(records)).not.toContain('input_audio_buffer.append');
    expect(VOICE_DIAGNOSTIC_PREFIX).toBe('[AETHER_VOICE_DIAGNOSTIC]');
  });

  test('emits nothing when development diagnostics are disabled', () => {
    const records: VoiceDiagnosticRecord[] = [];
    const diagnostics = new DevelopmentVoiceDiagnostics({
      enabled: false,
      sink: (record) => records.push(record),
    });
    diagnostics.record('session_started');
    diagnostics.complete();
    expect(records).toEqual([]);
  });
});
