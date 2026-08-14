# AETHER voice subsystem

Status: authoritative WebSocket implementation, 2026-08-13.

## Ownership and data flow

AETHER owns microphone capture and the complete audio-to-reminder handoff:

```text
Expo/native microphone PCM
  -> NativeAudioCapture
  -> Pcm16StreamNormalizer
  -> bounded pre-connect/transport buffering
  -> OpenAIRealtimeWebSocketTransport
  -> input_audio_buffer.append
  -> gpt-live-transcribe
  -> transcript delta progress
  -> authoritative completed transcript
  -> TranscriptReconciler
  -> existing AETHER parser/reminder workflow
```

`VoiceController` is a UI/native adapter. `VoiceSession` owns lifecycle
orchestration, microphone ownership, cancellation, commit sequencing, and the
parser handoff. `OpenAIRealtimeWebSocketTransport` owns only the provider
connection, protocol state machine, packet flushing, and provider events. It
does not contain React state or parser logic.

There is one microphone owner. The transport never creates a second capture
path and never asks WebRTC to manufacture an audio track.

## Why WebRTC was removed

The previous implementation generated an SDP offer without an audio media
section while sending manually captured PCM through the DataChannel. OpenAI
correctly rejected it as `invalid_offer`. Adding an empty transceiver, dummy
track, or unrelated microphone track would have preserved the architectural
conflict: native PCM capture would still be separate from the negotiated
WebRTC media path.

The authoritative transport is now `OpenAIRealtimeWebSocketTransport`. The
`react-native-webrtc` dependency, WebRTC transport, WebRTC tests, SDP call
endpoint, data-channel names, and WebRTC diagnostics have been removed.

## Authentication

The BYOK standard OpenAI API key remains in Expo SecureStore and is used only
by `OpenAIByokClientSecretProvider` for the HTTPS request to:

```text
POST https://api.openai.com/v1/realtime/client_secrets
```

The request creates the same transcription session configuration used by the
transport. OpenAI returns a short-lived client secret. Only that ephemeral
value is passed to the WebSocket. The transport sends it using the documented
WebSocket subprotocol:

```text
realtime
openai-insecure-api-key.<ephemeral-secret>
```

The permanent key is never passed to the WebSocket, placed in diagnostics, or
included in errors. See the [current OpenAI WebSocket guide](https://developers.openai.com/api/docs/guides/realtime-websocket)
and [client-secret reference](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create).

## Provider session and audio contract

The transport connects to the dedicated transcription WebSocket:

```text
wss://api.openai.com/v1/realtime?intent=transcription
```

`gpt-live-transcribe` is the nested transcription model. Official OpenAI
documentation defines it as the low-latency streaming speech-to-text model
for dedicated Realtime transcription sessions. AETHER needs live audio to
text, not speech-to-speech or a voice agent. The model is therefore locked
and is not a conversational Realtime session model. It must not appear as
`?model=gpt-live-transcribe`. Official conversational Realtime sessions use
`?model=<realtime-model>` (for example `gpt-realtime-2.1`). The client secret
already requests `session.type = "transcription"`; the WebSocket query must
not override that into a voice-agent session.

Historical failures:

1. WebRTC `invalid_offer` because the SDP offer had no audio media section
   while PCM was forced through a DataChannel.
2. WebSocket `invalid_model` because the transcription bootstrap used
   `?model=gpt-live-transcribe`. OpenAI treated that as a top-level Realtime
   session model, then rejected `session.update` with
   `Model "gpt-live-transcribe" is not supported in transcription mode.`

It sends the exact current transcription session shape through
`session.update`:

```json
{
  "type": "session.update",
  "session": {
    "type": "transcription",
    "audio": {
      "input": {
        "format": { "type": "audio/pcm", "rate": 24000 },
        "transcription": {
          "model": "gpt-live-transcribe",
          "languages": ["en", "es"],
          "prompt": "..."
        },
        "turn_detection": null
      }
    }
  }
}
```

`languages`, `keywords`, and `prompt` are included only when configured and
are supported transcription context fields. AETHER currently uses English
and Spanish hints and a short reminder-domain prompt. Turn detection is
explicitly `null`; the user stop action owns commit timing.

The upstream contract is strict:

- signed PCM16 samples;
- little-endian byte order;
- mono;
- 24,000 Hz;
- even byte count for every append;
- deterministic packet boundaries;
- Base64 only at the JSON event boundary.

`Pcm16StreamNormalizer` validates native metadata, downmixes, resamples, and
flushes its tail. The transport rejects odd-byte PCM and never silently
truncates an incomplete sample.

## Buffering and backpressure

Audio received before the provider session is ready is held by `VoiceSession`
in a bounded pre-connect buffer (384,000 bytes by default). The transport has
a bounded packet queue (32 packets by default), observes WebSocket
`bufferedAmount`, and caps the send buffer at 256,000 bytes by default.

If a queue limit is reached or the WebSocket cannot drain before its bounded
backpressure deadline, the session fails with `REALTIME_BACKPRESSURE`. Audio
is not silently dropped. Connection, configuration, backpressure, and final
transcript timers are cleared during every cleanup path.

## Transport lifecycle

`OpenAIRealtimeWebSocketTransport` uses explicit states:

```text
idle -> connecting -> connected -> configuring -> ready
ready -> committing -> finalizing -> closing -> closed
any active state -> failed
```

Appending before `ready`, committing without audio, configuring twice, or
otherwise crossing an illegal boundary produces a typed deterministic error.
Cancellation is idempotent: it stops accepting audio, discards unsent packets,
sends `input_audio_buffer.clear` when possible, closes the socket, and ignores
events from the retired socket generation.

## Commit and transcript authority

When the user presses stop, `VoiceSession`:

1. stops native capture;
2. flushes the normalizer tail;
3. appends all remaining valid PCM;
4. sends `input_audio_buffer.commit`;
5. waits in `finalizing` for the provider result;
6. reconciles and hands off only the completed transcript;
7. closes the transport and releases the audio session.

The commit acknowledgement is not treated as transcription completion. Partial
`conversation.item.input_audio_transcription.delta` events are progress data.
The authoritative text is the `transcript` field from
`conversation.item.input_audio_transcription.completed`, keyed by `item_id`.
Completion events are deduplicated and parser handoff is guarded to occur once.
The [current Realtime transcription guide](https://developers.openai.com/api/docs/guides/realtime-transcription)
defines the session, append/commit, delta, and completed event contracts.

## Failure taxonomy

Failures remain typed and user-visible:

- credential/authentication: `INVALID_CREDENTIAL`, `ACCOUNT_NOT_AUTHORIZED`,
  `TIER_NOT_SUPPORTED`, `REALTIME_AUTH_FAILED`;
- configuration/protocol: `SESSION_CONFIGURATION_INVALID`,
  `REALTIME_PROTOCOL_ERROR`;
- connection/lifecycle: `REALTIME_CONNECT_FAILED`,
  `REALTIME_CONNECTION_LOST`, `REALTIME_TIMEOUT`;
- bounded transport pressure: `REALTIME_BACKPRESSURE`;
- provider transcription: `TRANSCRIPTION_FAILED`, `TRANSCRIPTION_TIMEOUT`;
- capture/format: the existing microphone, PCM, and resampling error codes.

Deterministic authentication and configuration failures are not automatically
retried. Transient connection/provider failures may be retried only through
the existing bounded user-visible retry action. There is no reconnect loop.

## Safe diagnostics

Development diagnostics use the `[AETHER_VOICE_DIAGNOSTIC]` prefix and the
`aether.voice.diagnostic.v1` schema. Useful stages include:

```text
session_started
permission_result
microphone_stream_started
audio_format_detected
pcm_progress
credential_request_succeeded
websocket_connecting
websocket_open
session_created
session_configuration_sent
session_configuration_accepted
audio_append_progress
commit_sent
transcription_delta_progress
transcription_completed
parser_handoff
websocket_closed
cleanup_completed
session_summary
```

The summary includes safe counters such as `pcmChunksReceived`,
`pcmBytesProduced`, `audioAppendCount`, `audioBytesSubmitted`,
`transcriptionDeltaCount`, `transcriptionCompleted`, and
`parserHandoffCount`. It never includes permanent or ephemeral credentials,
authorization values, raw PCM, item ids, transcript text, or reminder content.

## Warning ownership

The voice change does not depend on these UI/runtime APIs. Source and installed
dependency inspection found:

- AETHER imports `SafeAreaView` from `react-native-safe-area-context` in
  `src/app/index.tsx`, `all.tsx`, `tasks.tsx`, and `settings.tsx`; it does not
  import React Native core `SafeAreaView`.
- `InteractionManager` is imported by the `expo-router` React Navigation stack
  implementation (`expo-router/build/react-navigation/stack/views/Stack/Card.js`).
- `Clipboard` is imported by Expo development tooling (`@expo/log-box`), not
  application voice code.
- No application or installed runtime source reference to the deprecated
  `ProgressBarAndroid` or `PushNotificationIOS` exports was found beyond the
  React Native core export/type tables. Their runtime warning origin needs the
  device warning stack to identify more precisely.

The direct safe-area import is already the supported package. The remaining
warnings are dependency/runtime-owned; vendor code is not modified as part of
voice transport work.

## Platform status and validation gates

The transport uses the standard React Native WebSocket interface and keeps all
voice-domain behavior platform-neutral. Android, iOS, and iPadOS can provide
the same `NativeAudioCapture`, permission, and audio-session interfaces. The
controller does not equate iOS with iPhone and the transport has no Android
networking dependency.

Current evidence is separated by gate:

- **STATIC VERIFIED**: source-level ownership, state machine, protocol payload,
  credential boundary, and cleanup paths;
- **UNIT VERIFIED**: protocol-contract tests, Base64/packet boundaries,
  backpressure, errors, cancellation, stale events, diagnostics privacy, and
  parser handoff;
- **LIVE PROVIDER VERIFIED**: only after the gated integration command runs
  with `OPENAI_API_KEY=...`;
- **PHYSICAL ANDROID VERIFIED**: not claimed until a real Android development
  build and device exercise the native PCM stream, WebSocket, stop/commit,
  navigation, cancellation, and Android Back paths;
- **PHYSICAL IOS VERIFIED / PHYSICAL IPADOS VERIFIED**: not claimed until
  corresponding signed development builds and devices validate capture and
  lifecycle behavior.

The Expo SDK 57 native microphone configuration remains owned by `expo-audio`.
Native build, device, signing, OEM, and API-level gates remain documented in
[`docs/KNOWN_TRADEOFFS.md`](KNOWN_TRADEOFFS.md); no unavailable device evidence
is inferred here.
