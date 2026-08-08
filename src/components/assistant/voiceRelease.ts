import type { RealtimeTranscriptionState } from '@/services/transcription/realtimeReducer';

export function getVoiceReleaseAction(
  state: RealtimeTranscriptionState,
  active: boolean,
  locked: boolean
): 'ignore' | 'defer' | 'commit' {
  if (locked || !active) return 'ignore';
  return state === 'connecting' ? 'defer' : 'commit';
}
