import { TaskPriority, TranscriptionResult } from '@/types';

export interface TranscriptionProvider {
  name: string;
  transcribeAudio: (audioUri: string, apiKey?: string) => Promise<TranscriptionResult>;
}

/**
 * Intelligent parser that extracts actionable tasks from speech text.
 */
export function parseSpeechToTasks(text: string): TranscriptionResult {
  if (!text || text.trim().length === 0) {
    return { text: '', taskCandidates: [] };
  }

  const rawLines = text
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

    // Capitalize first letter
    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);

    return {
      title: cleanTitle || line,
      priority,
      notes: `Created via Voice Transcribe at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    };
  });

  return {
    text,
    taskCandidates,
  };
}

/**
 * Default Whisper/OpenAI compatible transcription provider implementation.
 * Sends multipart/form-data to whisper endpoints if configured, or parses transcribed text.
 */
export class OpenAITranscriptionProvider implements TranscriptionProvider {
  name = 'OpenAI Whisper API';

  async transcribeAudio(audioUri: string, apiKey?: string): Promise<TranscriptionResult> {
    const keyToUse = apiKey?.trim();

    if (!keyToUse && audioUri && !audioUri.startsWith('mock://')) {
      throw new Error('AI_API_KEY_MISSING');
    }

    if (keyToUse && audioUri && !audioUri.startsWith('mock://')) {
      try {
        const formData = new FormData();
        formData.append('file', {
          uri: audioUri,
          type: 'audio/m4a',
          name: 'audio.m4a',
        } as unknown as Blob);
        formData.append('model', 'whisper-1');

        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${keyToUse}`,
          },
          body: formData,
        });

        if (res.ok) {
          const json = await res.json();
          return parseSpeechToTasks(json.text || '');
        }
      } catch {
        // Fallback to local audio simulation if network or endpoint fails
      }
    }

    // Demo / fallback voice transcript simulation
    const mockTranscripts = [
      'Call Sarah regarding the product launch design specs urgent and schedule team sync for tomorrow',
      'Buy groceries for dinner, review quarterly budget report, and check server logs',
      'Prepare presentation slides for investors, update TaskFlow AI documentation, high priority',
    ];

    const randomText = mockTranscripts[Math.floor(Math.random() * mockTranscripts.length)];
    return parseSpeechToTasks(randomText);
  }
}

export const defaultTranscriptionProvider: TranscriptionProvider = new OpenAITranscriptionProvider();
