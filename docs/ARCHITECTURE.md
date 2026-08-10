# Current AETHER architecture

Status: corrective implementation, 2026-08-07.

## Five app surfaces

The app keeps five user-facing surfaces:

- `/` — Home
- `/tasks` — Tasks
- `/ai` — AETHER reasoning status and model overview
- `/transcribe` — Realtime voice status and flow overview
- `/settings` — independent provider credentials, model selection, and preferences

`AssistantHost` is mounted once above the router. It owns the single composer,
conversation sheet, Orb, voice controller, confirmation UI, and handoff into
the existing `AgentRuntime`. The `/ai` and `/transcribe` routes explain the
current providers and flow; they do not create alternate assistant or recording
owners.

## Provider boundary

OpenRouter is the only conversational inference provider. The exact default
model id is `deepseek/deepseek-v4-flash`. Before every run, the selected exact
id is looked up in the current OpenRouter model catalog and its modalities,
streaming, tools, tool-choice, and structured-output metadata are checked.
There is no catalog-order fallback and no fabricated model suffix.

OpenAI is used only for realtime transcription with
`gpt-realtime-whisper`. It emits transcript deltas and a committed final
transcript; only that final text is passed to the OpenRouter `AgentRuntime`.
OpenAI never receives agent prompts, task tools, or conversational reasoning
requests.

## Credentials

OpenRouter and OpenAI keys use separate Expo SecureStore entries and separate
loaded/configured state. Zustand persistence serializes only selected model,
theme, haptics, and summary preferences. Keys are not persisted to
AsyncStorage, SQLite, analytics, logs, error payloads, source, or app config,
and the settings UI displays only saved/not-saved status after a key is saved.

## Voice lifecycle

The local voice controller owns the high-frequency audio buffer, transcript
delta, cancellation, and audio-level state:

```text
idle
  -> connecting
  -> listening
  -> transcribing
  -> finalizing
  -> AgentRuntime thinking/executing/responding
  -> idle
```

Permission denial, invalid keys, malformed events, network loss, app
interruption, empty final transcripts, cancellation, duplicate completion
events, and unmount all close the active session and microphone resources.
Only one voice session can be active. Empty or cancelled sessions cannot submit
tasks.

Expo SDK 57 `expo-audio` `useAudioStream()` supplies little-endian PCM16. The
normalizer uses the actual native sample rate and channel count to produce mono
24 kHz PCM16. The mobile transport negotiates OpenAI Realtime through
`/v1/realtime/calls` using a short-lived client secret, then sends bounded PCM
append and manual commit events over an ordered WebRTC data channel. The
application-owned or BYOK standard key never enters that transport. Native
WebRTC behavior still requires user-driven validation in a new development build.
