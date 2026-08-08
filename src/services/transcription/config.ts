/** Speech configuration is intentionally separate from the conversational agent model. */
export const DEFAULT_OPENROUTER_SPEECH_MODEL = 'openai/whisper-1';

export interface SpeechConfiguration {
  provider: 'openrouter';
  model: string;
}

export const openRouterSpeechConfiguration: SpeechConfiguration = {
  provider: 'openrouter',
  model: DEFAULT_OPENROUTER_SPEECH_MODEL,
};
