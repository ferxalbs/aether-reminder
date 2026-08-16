# Current AETHER architecture

Status: corrective implementation, 2026-08-07.

## Five app surfaces

The app keeps five user-facing surfaces:

- `/` — Home
- `/tasks` — Tasks
- `/ai` — AETHER reasoning status and model overview
- `/transcribe` — Realtime voice status and flow overview
- `/settings` — Usage, preferences, and privacy information

`AssistantHost` is mounted once above the router. It owns the single composer,
conversation sheet, Orb, voice controller, confirmation UI, and handoff into
the existing `AgentRuntime`. The `/ai` and `/transcribe` routes explain the
current providers and flow; they do not create alternate assistant or recording
owners.

## Provider boundary

When `EXPO_PUBLIC_AETHER_CLOUD_URL` is set, hosted assistant turns go through
AETHER Cloud (`POST /v1/ai/turns`) and hosted live transcription asks Cloud
for a short-lived OpenAI client secret (`POST /v1/voice/authorizations`).
AETHER Cloud owns commercial policy and provider credentials. Mobile still
owns tool execution, SQLite, confirmation, undo, PCM, and the OpenAI
Realtime WebSocket.

When the URL is unset in development, hosted AI and voice are unavailable; no
provider-key fallback exists. Local task and reminder behavior remains
available. Release builds require a valid HTTPS Cloud origin.

## Credentials

AETHER Reminder contains no provider credential configuration. Cloud provider
credentials remain server-side. The only voice credential held on mobile is a
short-lived memory-only authorization issued by AETHER Cloud.

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

Permission denial, authorization failure, malformed events, network loss, app
interruption, empty final transcripts, cancellation, duplicate completion
events, and unmount all close the active session and microphone resources.
Only one voice session can be active. Empty or cancelled sessions cannot submit
tasks.

Expo SDK 57 `expo-audio` `useAudioStream()` supplies little-endian PCM16. The
normalizer uses the actual native sample rate and channel count to produce mono
24 kHz PCM16. The transport opens
`wss://api.openai.com/v1/realtime?intent=transcription` with a short-lived
client secret in the documented WebSocket subprotocol, then sends bounded PCM
append and manual commit events. `gpt-live-transcribe` is configured only at
`session.audio.input.transcription.model`. AETHER Cloud authorization never
enters persistent storage. Native capture and WebSocket
behavior still require user-driven validation in a new development build.
