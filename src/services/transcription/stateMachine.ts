import type { VoiceError, VoiceErrorCode } from './errors';

export type VoiceState =
  | 'idle'
  | 'checking_permission'
  | 'connecting'
  | 'listening'
  | 'committing'
  | 'finalizing'
  | 'parsing'
  | 'review'
  | 'committed'
  | 'permission_denied'
  | 'capture_failed'
  | 'connection_failed'
  | 'transcription_failed'
  | 'parsing_failed'
  | 'cancelled';

export type VoicePermissionState = 'unknown' | 'checking' | 'granted' | 'denied' | 'blocked';

export interface VoiceSnapshot {
  state: VoiceState;
  permission: VoicePermissionState;
  partialTranscript: string;
  finalTranscript: string;
  activeItemId: string | null;
  error: VoiceError | null;
  retryAttempt: number;
}

export const initialVoiceSnapshot: VoiceSnapshot = {
  state: 'idle',
  permission: 'unknown',
  partialTranscript: '',
  finalTranscript: '',
  activeItemId: null,
  error: null,
  retryAttempt: 0,
};

const transitions: Record<VoiceState, readonly VoiceState[]> = {
  idle: ['checking_permission'],
  checking_permission: ['connecting', 'permission_denied', 'cancelled'],
  connecting: ['listening', 'capture_failed', 'connection_failed', 'transcription_failed', 'cancelled'],
  listening: ['committing', 'capture_failed', 'connection_failed', 'transcription_failed', 'cancelled'],
  committing: ['finalizing', 'capture_failed', 'connection_failed', 'transcription_failed', 'cancelled'],
  finalizing: ['parsing', 'connection_failed', 'transcription_failed', 'cancelled'],
  parsing: ['review', 'parsing_failed', 'cancelled'],
  review: ['committed', 'idle', 'checking_permission', 'cancelled'],
  committed: ['idle', 'checking_permission'],
  permission_denied: ['checking_permission', 'idle', 'cancelled'],
  capture_failed: ['checking_permission', 'idle', 'cancelled'],
  connection_failed: ['checking_permission', 'idle', 'cancelled'],
  transcription_failed: ['checking_permission', 'idle', 'cancelled'],
  parsing_failed: ['checking_permission', 'idle', 'cancelled'],
  cancelled: ['idle'],
};

export function isFailureState(state: VoiceState): boolean {
  return state === 'permission_denied'
    || state === 'capture_failed'
    || state === 'connection_failed'
    || state === 'transcription_failed'
    || state === 'parsing_failed';
}

export function failureStateFor(code: VoiceErrorCode): VoiceState {
  if (code === 'MIC_PERMISSION_DENIED' || code === 'MIC_PERMISSION_BLOCKED') return 'permission_denied';
  if (code.startsWith('AUDIO_') || code === 'RESAMPLE_FAILED') return 'capture_failed';
  if (code.startsWith('REALTIME_')
    || code === 'INVALID_CREDENTIAL'
    || code === 'ACCOUNT_NOT_AUTHORIZED'
    || code === 'TIER_NOT_SUPPORTED'
    || code === 'SESSION_CONFIGURATION_INVALID'
    || code === 'MODEL_TEMPORARILY_UNAVAILABLE') return 'connection_failed';
  if (code === 'PARSING_FAILED') return 'parsing_failed';
  return 'transcription_failed';
}

export class VoiceStateMachine {
  private value: VoiceSnapshot = initialVoiceSnapshot;

  get snapshot(): VoiceSnapshot {
    return this.value;
  }

  resetForStart(): VoiceSnapshot {
    if (this.value.state !== 'idle' && !isFailureState(this.value.state)
      && this.value.state !== 'review' && this.value.state !== 'committed') {
      throw new Error(`Cannot start voice capture from ${this.value.state}.`);
    }
    this.value = { ...initialVoiceSnapshot };
    return this.transition('checking_permission', { permission: 'checking' });
  }

  transition(next: VoiceState, patch: Partial<Omit<VoiceSnapshot, 'state'>> = {}): VoiceSnapshot {
    if (!transitions[this.value.state].includes(next)) {
      throw new Error(`Illegal voice transition: ${this.value.state} -> ${next}.`);
    }
    this.value = { ...this.value, ...patch, state: next };
    return this.value;
  }

  update(patch: Partial<Omit<VoiceSnapshot, 'state'>>): VoiceSnapshot {
    this.value = { ...this.value, ...patch };
    return this.value;
  }

  fail(error: VoiceError): VoiceSnapshot {
    return this.transition(failureStateFor(error.code), { error });
  }
}
