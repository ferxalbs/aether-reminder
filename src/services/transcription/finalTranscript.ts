import { TranscriptionError } from './errors';

export interface SubmissionGuard {
  current: boolean;
}

/** Deliver one non-empty committed transcript; partials and duplicate completions are ignored by callers. */
export function deliverFinalTranscript(
  text: string,
  guard: SubmissionGuard,
  submit: (finalText: string) => void
): boolean {
  const finalText = text.trim();
  if (!finalText) throw new TranscriptionError('EMPTY_TRANSCRIPT', 'No final transcript was committed.');
  if (guard.current) return false;
  guard.current = true;
  submit(finalText);
  return true;
}
