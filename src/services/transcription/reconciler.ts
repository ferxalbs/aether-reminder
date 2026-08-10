import type { VoiceSnapshot } from './stateMachine';

export class TranscriptReconciler {
  private readonly deltas = new Map<string, string>();

  delta(snapshot: VoiceSnapshot, itemId: string, delta: string): Partial<VoiceSnapshot> {
    const next = (this.deltas.get(itemId) ?? '') + delta;
    this.deltas.set(itemId, next);
    return {
      activeItemId: itemId,
      partialTranscript: next,
      finalTranscript: snapshot.finalTranscript,
    };
  }

  completed(itemId: string, transcript: string): Partial<VoiceSnapshot> {
    this.deltas.set(itemId, transcript);
    return {
      activeItemId: itemId,
      partialTranscript: transcript,
      finalTranscript: transcript,
    };
  }

  reset(): void {
    this.deltas.clear();
  }
}
