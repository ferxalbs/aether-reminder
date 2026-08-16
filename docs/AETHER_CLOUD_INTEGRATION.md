# AETHER Reminder ↔ AETHER Cloud

AETHER Cloud extends AETHER Reminder. It does not replace local task, reminder,
SQLite, confirmation, undo, or tool authority.

This document records the local development path that the mobile client now
implements. It is not a production deployment guide.

## Local development connection

1. Run AETHER Cloud locally with `AETHER_ENV=development`.
2. Set a public, non-secret Cloud URL in the mobile app:

```text
EXPO_PUBLIC_AETHER_CLOUD_URL=http://127.0.0.1:8080
```

1. On a physical Android device, a USB reverse such as
   `adb reverse tcp:8080 tcp:8080` can make that loopback URL reachable.
   The URL is not hardcoded in product code.

Hosted capabilities require AETHER Cloud. When the public Cloud origin is
absent in a development build, hosted AI and voice report an unavailable
configuration state; local Reminder functionality continues to work. Release
configuration must supply a valid HTTPS origin. This public origin is build
configuration, not a secret.

The application does not call `/ready` at boot and does not require Cloud to
read local reminders.

## Development identity

Physical E2E uses Cloud's existing development headers:

```text
X-Aether-User-Id
X-Aether-Device-Id
```

Default test identity:

```text
e2e.mobile.physical.aether-reminder
e2e.device.physical.dev
```

These labels are not production JWTs and are not RevenueCat authentication.
Production JWT/JWKS remains an open Cloud gate.

## Voice authorization

```text
microphone
 → existing PCM capture
 → POST /v1/voice/authorizations
 → ephemeral OpenAI client secret
 → existing OpenAI Realtime WebSocket
 → transcript
```

The authorization is requested immediately before the WebSocket opens, not when
the screen mounts. The secret stays in memory, is never written to SQLite,
SecureStore, or AsyncStorage, and is not logged.

Cloud-issued sessions keep the Cloud transcription contract:

```text
audio/pcm
24000 Hz
gpt-live-transcribe
turn_detection = null
```

The hosted path does not send `session.update` for protected session fields.

## Hosted AI gateway

```text
Mobile AgentRuntime
 → POST /v1/ai/turns
 → AETHER Cloud sanitizer
 → OpenRouter
 → streamed text / tool calls
 → Mobile executes local tools
 → tool result on the next turn
```

Mobile sends `capability`, `toolsetVersion = aether.tasks.v1`, and
user/assistant/tool messages. It does not send `apiKey`, `provider`, `model`,
or raw tool definitions.

Local adapters execute the server-owned tools:

- `list_tasks`
- `propose_task_mutation`

Confirmation, receipts, undo, and SQLite remain on the device.

## Hosted credential boundary

An AETHER-owned OpenAI or OpenRouter master key must not ship in the mobile
app, and AETHER Reminder does not support BYOK. The only OpenAI credential on
mobile is a short-lived `ek_*` voice authorization returned by AETHER Cloud;
it remains memory-only and is never logged or persisted.

## Usage

`GET /v1/me/usage` is the server-authoritative consumer usage contract. It
returns the current plan, billing-period reset, AI request usage, voice-second
usage, optional automation usage, and capability flags. Mobile never derives
quota from receipts or local counters, and an unavailable endpoint is shown as
unavailable rather than as zero usage. The current plan remains sourced from
`GET /v1/me/subscription` until Cloud consolidates the responses.

## Failure and recovery

Cloud-backed voice and assistant actions fail independently. Local reminder
and task surfaces continue from SQLite. Cancellation aborts the outstanding
Cloud request, stops the microphone, and closes the OpenAI socket.

Retries stay bounded. There is no hidden fallback from hosted Cloud onto a
user BYOK key.
