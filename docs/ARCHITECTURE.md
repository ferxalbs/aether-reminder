# Current AETHER architecture

Status: corrective implementation, 2026-08-07.

## Platform planes

```text
IDENTITY PLANE

Supabase Auth → verified (issuer, subject) → AETHER Cloud → canonical accountId

PRODUCT PLANE

Android/iOS/iPadOS mobile → AETHER Cloud → hosted AI, Voice, and policy

Post-launch platform scope → Sync and Automation

DATA PLANE

SQLite = local task authority
Turso PersonalDataPlane = Sync transport/storage behind AETHER Sync v1
Neon = Cloud control metadata only

COMMERCE PLANE

Android → RevenueCat ─┐
                      ├→ AetherEntitlement → CommercialPolicy
Web/macOS → Polar ────┘

CONTROL PLANE UI

AETHER Web owns account, identity/security, devices, plan, billing, usage,
sync/data controls, downloads, and future integrations. It is not Reminder Web.
```

Supabase Auth is replaceable because Mobile depends only on the Cloud bearer
contract and canonical account mapping, not on Supabase IDs. RevenueCat and
Polar are commerce adapters, not identity providers. Native Reminder remains
local-first and Cloud never becomes task authority.

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

The current mobile release is local-first: SQLite and local notifications remain
the operational reminder authority. Hosted-services bootstrap restores the
authenticated Cloud/device identity and binds RevenueCat when configured, but it
does not construct or run the retained Sync v1 engine. Multi-device Sync remains
post-launch scope without deleting its migrations, repositories, or Cloud
contract.

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
