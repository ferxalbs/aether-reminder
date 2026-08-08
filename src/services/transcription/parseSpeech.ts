import { TaskPriority, TranscriptionResult } from '@/types';

/**
 * Heuristic extraction of task candidates from plain speech text.
 * Does not call any network API. Empty input → empty candidates (not fake data).
 */
export function parseSpeechToTasks(text: string): TranscriptionResult {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) {
    return { text: '', taskCandidates: [] };
  }

  const rawLines = trimmed
    .split(/(?:\.|\n|;|\band then\b|\balso\b|\bnext\b)+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  const taskCandidates = rawLines.map((line) => {
    let priority: TaskPriority = 'medium';
    let cleanTitle = line;

    if (/\b(urgent|asap|important|critical|high priority)\b/i.test(line)) {
      priority = 'high';
      cleanTitle = line.replace(/\b(urgent|asap|important|critical|high priority)\b/gi, '').trim();
    } else if (/\b(whenever|low priority|later|maybe)\b/i.test(line)) {
      priority = 'low';
      cleanTitle = line.replace(/\b(whenever|low priority|later|maybe)\b/gi, '').trim();
    }

    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);

    return {
      title: cleanTitle || line,
      priority,
    };
  });

  return {
    text: trimmed,
    taskCandidates,
  };
}
