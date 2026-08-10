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
- `OpenAIRealtimeWebSocketTransport`: ordered bounded PCM append queue, manual commit,
  Realtime events, timeouts, and socket cleanup. The standard key never reaches it.
- `TranscriptReconciler`: reconciles deltas and authoritative completions by `item_id`.

## Transport decision

OpenAI generally recommends WebRTC for a browser or mobile client. AETHER intentionally
uses WebSocket for this transcription-only implementation because Expo supplies raw PCM
buffers that must be explicitly downmixed/resampled and sent as
`input_audio_buffer.append`. `react-native-webrtc` captures its own native media track
and sends WebRTC audio rather than accepting Expo `ArrayBuffer` PCM. Combining both
would require a custom native WebRTC audio source and would replace the tested PCM path.

The `RealtimeTranscriptionTransport` interface keeps a future WebRTC implementation from
changing `VoiceSession`. Such a migration would need `react-native-webrtc`, compatible
Expo config/native integration, a new development build, and a separate capture/format
validation strategy.

## Production configuration

- Model: `gpt-live-transcribe`
- Session: `type: "transcription"`
- Input: mono PCM16, 24 kHz after normalization
- Turn detection: `null`; the user owns stop/commit
- Context: short personal reminders with English/Spanish language hints; keywords remain
  configurable and empty by default
- Background recording: disabled
