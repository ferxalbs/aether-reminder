# AETHER Reminder ↔ AETHER Cloud

AETHER Cloud extends AETHER Reminder. It does not replace local task, reminder,
SQLite, confirmation, undo, or tool authority.

This document records the local development path and the release identity
boundary. It is not a production deployment guide.

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

Local development/E2E may use Cloud's explicitly development-only headers:

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
They are never selected by the release configuration.

## Release identity and account continuity

Release Android uses Supabase Auth only as an external identity provider:

```text
fresh install
  → SecureStore installationId
  → persisted Supabase anonymous session
  → Authorization: Bearer <access token>
  → Cloud verifies issuer/JWKS/audience/expiry
  → (issuer, subject) → canonical AETHER accountId
  → POST /v1/me/devices
  → SecureStore canonical deviceId
```

The session service initializes Auth once, recovers its persisted session,
creates an anonymous authenticated session when none exists, and refreshes
tokens without exposing Supabase to unrelated domain modules. A future email,
OAuth, or passkey link is added to this external user; Cloud therefore
resolves the same identity mapping and does not create a second AETHER account.
This phase only starts the email identity update; Supabase
confirmation/password completion and OAuth UI remain future client work.
Signing out or clearing local Auth storage intentionally loses an anonymous
identity unless it was linked to a recoverable method first.

`installationId` is client-generated and stable per installation where
possible. `deviceId` is Cloud-generated, account-owned, persisted securely, and
only sent as `X-Aether-Device-Id` after bearer authentication. It is never
authentication by itself. If Cloud reports that the canonical device has been
revoked, Mobile clears that device identity, rotates the installation ID once,
and repeats the same authenticated registration flow; it does not bypass Cloud
authorization or discard local data.

RevenueCat is initialized only for Android commerce and receives the canonical
AETHER `accountId` through its externally managed App User ID / `logIn` path
after Cloud identity resolution. A RevenueCat outage cannot block Auth or local
SQLite. Web/macOS commerce remains Polar-backed; no browser Reminder app is
planned.

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

## Sync status

AETHER Cloud owns the provider-neutral Sync v1 contract and PersonalDataPlane
boundary. Mobile now participates in that contract through a bounded local-first
Sync engine. SQLite remains the operational authority; Cloud only coordinates
replication, identity, device authorization, and commercial policy.

The Mobile implementation is composed of:

- migration `0010_sync`, which adds account/device-scoped outbox, cursor,
  entity-version, runtime, and preference-sync state;
- repository-owned transactions, where a task, reminder, recurrence, capture,
  or preference mutation and its Sync intent commit together;
- typed `/v1/sync/negotiate`, `/v1/sync/push`, and `/v1/sync/pull` methods on the
  existing authenticated Cloud client;
- bounded push/pull workers with request timeouts, cancellation, retry
  retention, stable mutation IDs, pagination, and redacted diagnostics; and
- transactionally idempotent reconciliation, including version checks,
  conflict preservation, tombstones, and native-notification cancellation
  state.

Sync v1 mappings remain explicit:

- `tasks`: local task fields, including stable task ID, title, notes, status,
  schedule, completion, and project reference;
- `reminders`: primary local reminders, plus recurrence rules as typed synthetic
  reminder entities with IDs prefixed `recurrence:`;
- `captures`: capture commit metadata, source metadata, and URL sources;
- `preferences`: the supported AETHER settings snapshot under entity ID
  `settings`.

Projects and adaptive reminder projections are local-only. Local image asset
paths are host-private and never enter Cloud payloads; Sync carries image
metadata and preserves an existing local asset when the same capture returns
to its origin device. A remote device does not fabricate a local asset path.

Push removes an outbox row only after an `applied` or `already_applied`
acknowledgement. Temporary failures retain it. A conflict retains the local
mutation and records the remote version/payload for explicit handling. Cloud's
declared rule remains exact `baseVersion` equality with the current entity
version; Mobile does not apply last-write-wins.

Pull applies every page and its next cursor in one SQLite transaction. A failed
reconciliation leaves the prior cursor, so the page can replay safely.
Account/device-scoped cursors and outbox rows are never reused for another
canonical account. A rejected cursor is discarded only for that scope and
retried once from the beginning. Because domain rows are still device-global,
same-ID account collisions are durably marked and skipped rather than allowed
to overwrite or delete the existing local row; full account-partitioned local
data remains a future product decision. Startup renders local data before
Cloud bootstrap; Sync runs after account/device readiness, on foreground retry,
and on a bounded active interval while the app is active. A local mutation never waits for
network; its durable outbox intent is picked up by the next bounded Sync run.
No long-running background-sync mechanism is assumed.

Deterministic Mobile coverage proves atomic outbox writes, stable retry
identity, push retention and acknowledgements, pull replay and pagination,
all four collections, tombstones, conflicts, restart persistence, and
account/device isolation. Live Cloud/Turso configuration and physical
Android Sync E2E remain separate runtime gates.

## Failure and recovery

Cloud-backed voice and assistant actions fail independently. Local reminder
and task surfaces continue from SQLite. Cancellation aborts the outstanding
Cloud request, stops the microphone, and closes the OpenAI socket.

Retries stay bounded. There is no hidden fallback from hosted Cloud onto a
user BYOK key.
