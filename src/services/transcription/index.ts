export type { SpeechToTextProvider } from './openrouterStt';
export { OpenRouterSTTProvider, defaultTranscriptionProvider } from './openrouterStt';
export { parseSpeechToTasks } from './parseSpeech';
export { openRouterSpeechConfiguration, DEFAULT_OPENROUTER_SPEECH_MODEL } from './config';
export {
  TranscriptionError,
  getTranscriptionErrorMessage,
  type TranscriptionErrorCode,
} from './errors';
