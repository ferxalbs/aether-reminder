# Voice subsystem architecture

## Removed architecture

The previous voice path concentrated permission prompting, native stream ownership,
per-buffer resampling, standard-key WebSocket authentication, retry timers, transcript
reduction, and UI state inside `VoiceController`. It had no audio-session owner and
represented all failures with one `error` state. Its transport authenticated the
WebSocket with the long-lived BYOK key. No recorded-file upload or temporary-audio-file
workflow existed.

The old `openaiRealtime`, `realtimeReducer`, `voiceRelease`, and final-transcript guard
abstractions were removed. The preserved boundary is the completed transcript passed
to the existing assistant/reminder interpretation pipeline.

## Ownership

- `VoiceController`: React/Expo adapter only; creates `useAudioStream`, publishes state,
  and handles route-change, app-background, native-stream-interruption, and unmount cleanup.
- `VoiceSession`: lifecycle orchestration, legal state transitions, bounded preconnect
  audio, explicit stop/commit, final-transcript handoff, and deterministic cleanup.
- `expoAudioSession`: the sole global Expo audio-mode owner and single-microphone lease.
- `Pcm16StreamNormalizer`: validates little-endian PCM16, downmixes interleaved channels,
  and continuously resamples the actual native rate to 24 kHz without resetting phase.
- `OpenAIByokClientSecretProvider`: uses the user-owned SecureStore key only to create a
  short-lived `/v1/realtime/client_secrets` credential.
- `OpenAIRealtimeWebRtcTransport`: GA `/v1/realtime/calls` SDP negotiation, ordered
  `oai-events` data channel, bounded PCM append queue, manual commit, Realtime events,
  timeouts, and native peer cleanup. The standard key never reaches it.
- `TranscriptReconciler`: reconciles deltas and authoritative completions by `item_id`.
- `DevelopmentVoiceDiagnostics`: development-only structured stage/counter output. Its
  schema cannot contain credentials, authorization headers, PCM, or transcript text.

## Transport decision

OpenAI recommends WebRTC for mobile clients. AETHER establishes the GA WebRTC session
through `/v1/realtime/calls` and uses its ordered `oai-events` data channel for client
events. Expo remains the sole microphone owner: validated, downmixed, resampled PCM16 is
sent in bounded `input_audio_buffer.append` events, followed by a manual
`input_audio_buffer.commit`. This avoids a second native microphone capture path while
using the mobile Realtime transport and keeping the exact PCM contract observable.

`react-native-webrtc` is a native dependency, so this transport requires a newly built
Expo development client. It is autolinked; no WebRTC camera/microphone config plugin is
used because WebRTC does not own media capture in this architecture. `expo-audio`
continues to own the sole microphone permission and audio session.

## Production configuration

- Model: `gpt-live-transcribe`
- Session: `type: "transcription"`
- Input: mono PCM16, 24 kHz after normalization
- Turn detection: `null`; the user owns stop/commit
- Context: short personal reminders with English/Spanish language hints; keywords remain
  configurable and empty by default
- Background recording: disabled
