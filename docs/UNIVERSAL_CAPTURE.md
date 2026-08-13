# Universal Capture

> **Invariant:** Native system surfaces capture intent. AETHER's domain decides what becomes a task.

Universal Capture makes AETHER an offline-first destination for explicit user intent. Platform surfaces own only acquisition, validation, durable handoff, and their lifecycle. The existing deterministic parser, task commands, SQLite task database, reminder projection, nudges, and attention engine remain application-owned.

## Architecture

```text
                   ┌──────────────────────┐
                   │   Android Sharesheet │
                   ├──────────────────────┤
                   │   Quick Settings     │
                   ├──────────────────────┤
                   │   App Shortcut       │
                   └──────────┬───────────┘
                              │
                              ▼
                       Android Ingress
                              │
                              │
┌──────────────────────┐      │
│ iOS Share Extension  │      │
├──────────────────────┤      │
│ App Intent/Shortcut  │      │
└──────────┬───────────┘      │
           │                  │
           ▼                  │
      Apple Ingress           │
           │                  │
           └─────────┬────────┘
                     ▼
               CaptureEnvelope
                     │
                     ▼
              Capture Inbox
                     │
                     ▼
           CaptureOrchestrator
                     │
                     ▼
         deterministic fast path
                     │
                     ▼
               Domain Command
                     │
                     ▼
                  SQLite
          ┌──────────┼───────────┐
          ▼          ▼           ▼
     Reliability   Nudges     NOW/NEXT
```

## Capture contract

`CaptureEnvelope` is the sole normalized ingress contract. It contains a stable ID, ingress enum, ordered parts, creation time, idempotency key, lifecycle state, review requirement, and optional committed task ID. Supported v1 parts are bounded text, exact HTTP(S) URLs, and at most one locally managed JPEG, PNG, HEIC, HEIF, or WebP image. Images are capped at 15 MiB; text is capped at 10,000 characters. Video, audio files, generic documents, PDFs, OCR, vision, and remote URL fetching are rejected or outside scope.

Native `Intent`, `Uri`, `NSItemProvider`, UTI, and App Group values do not cross this boundary. External objects are validated and copied before an envelope reaches application services. Original URLs are preserved without fetching metadata.

`CaptureDraft` is non-authoritative review state: title, notes where already supported, temporal fields, priority, and ordered URL/image sources. Text uses the existing local parser. URL-only captures get a neutral local title that the user can edit. Image-only captures require a user title; AETHER does not claim to understand the image.

## Ingress lifecycle and durable inbox

External capture uses `aether_capture_ingress.sqlite`, a small transport journal separate from `aether.db`. It stores envelope metadata, ordered payload JSON/reference metadata, state, attempts, claim lease, commit linkage, timestamps, and privacy-safe local events. It does not contain task or reminder tables.

The inbox enables WAL, a short SQLite busy timeout, parameterized statements, bounded batches, and stale-claim recovery. External ingress is accepted only when the journal owns its payload. “Saved to AETHER” means this handoff succeeded; it does not mean a reminder was scheduled.

The main app drains at bootstrap and foreground activation. Items requiring review stay outside the automatic drain until the user confirms them. One failing item cannot stop subsequent items. Failures are terminal for invalid/unsupported content and retryable for transient database or storage conditions.

## Exactly-once commit

Ingress is at least once. Observable task creation is exactly once through a durable marker in the authoritative database:

```text
capture_commits.capture_id UNIQUE → tasks.id
```

Task insertion, task event insertion, source insertion, and capture marker insertion occur in one `aether.db` transaction. A replay queries or conflicts on the marker and returns the existing task. If the process dies after the domain transaction but before inbox acknowledgement, the next drain recovers the same task ID and marks the inbox row committed; it never creates a second task. Timestamp or title equality is never used for deduplication.

## Android

`AetherCaptureModule` handles `ACTION_SEND` for `text/*` and the explicit image MIME allowlist. It rejects wrong actions, empty payloads, multiple streams, non-`content://` image handles, unreadable streams, MIME mismatches, and oversized files. A received image is streamed into an app-controlled pending directory before temporary URI permission can expire. Universal Capture requests no broad storage/media permission.

The React Native `/capture` route is the compact review surface for text, URL, and image input. The route supports editing before commit and never transports private payload text through a deep-link query. `aether://capture` expresses navigation only; `+native-intent.tsx` defensively rewrites malformed or unrelated input to a safe route.

`AetherCaptureTileService` has one responsibility: launch `aether://capture?ingress=android_quick_settings`. Android 14+ uses the supported `PendingIntent` activity launch API; older supported versions use the compatibility path. The service does not access repositories, notifications, parsers, or business state.

The single static launcher shortcut, “Add reminder,” opens the same route with `android_shortcut` ingress. It contains no task or user data. The CNG plugin adds bounded share filters and shortcut metadata; the Expo Module manifest registers only the tile service with its required binding permission.

## iOS and iPadOS

`AetherShareExtension` is a native SwiftUI/UIKit extension, not a React Native runtime. It validates `NSExtensionItem`/`NSItemProvider` representations, loads only supported text/URL/image values, immediately copies an image into App Group pending storage, shows an adaptive review surface, writes the durable envelope, and completes the extension request. It never opens the host app, accesses `aether.db`, schedules a notification, starts AI, or ports the deterministic parser.

The composer has a readable 560-point maximum width and otherwise adapts to compact iPhone and resizable iPad layouts. It uses system Dynamic Type, native toolbar semantics, keyboard focus, and accessibility labels. Its action says “Save,” and supporting text explains that local interpretation occurs when the main app is available.

The main app and Share Extension share only:

```text
group.com.ferxalbs.aetherreminder.capture
  ├── aether_capture_ingress.sqlite
  └── capture-assets/pending/<capture-id>/…
```

After import, committed image sources move to host-private Application Support at
`AetherCapture/task-sources/<capture-id>`. The Share Extension has no need or
authority to read committed task assets. The production task database also stays
in the host app sandbox. Cross-process writes are short transactions against the
narrow ingress journal.

`CaptureWithAetherIntent` exposes one text parameter to Shortcuts, Siri, Spotlight-compatible surfaces, and one generic App Shortcut. It writes the same App Group inbox and returns “Saved to AETHER.” It does not use `openAppWhenRun`, deprecated host-launch behavior, private APIs, or a separate task path. On current compiler/platform combinations it explicitly declares background execution support using the modern App Intents mode API.

The Share Extension bundle ID is `com.ferxalbs.aetherreminder.capture-share`. Both targets require the matching App Group capability in the Apple Developer account and provisioning profiles.

## Orchestration and existing engines

`CaptureOrchestrator.prepare` validates normalized input, invokes `parseLocalReminderInput` for text, and builds an editable draft. `commit` checks the durable marker, adopts any image source, calls `AetherCommandExecutor.createCapturedTask`, and emits safe events/targeted invalidation.

In-app Quick Capture and final voice transcripts create the same envelope/draft semantics directly while the runtime is active, avoiding pointless inbox I/O. Voice recording and transcription are otherwise unchanged. No capture is sent to an LLM.

The captured task uses the existing task command and reminder synchronization path. A due task makes the reliability projection dirty; Universal Capture never schedules native notifications itself. Notification projection failure remains non-fatal and repairable by Production Reliability. Capture does not invoke Smart Recovery. Adaptive Nudges receive the normal post-command replan without treating ingress as priority. NOW/NEXT is recomputed through its normal ranking only after a successful commit; capture never implies NOW.

## Source and asset lifecycle

`task_capture_sources` stores ordered URL/image metadata in `aether.db`; it does not encode sources in notes or titles. The task editor exposes captured URLs as links and images as local previews.

```text
foreign temporary handle
→ validate and bounded stream copy
→ App Group/app pending asset
→ durable envelope
→ transactional task/source commit
→ copy into host-private task-sources
→ update source reference
→ remove App Group pending directory only after the private copy exists
```

Discard removes pending assets. Failed commits retain the only valid pending copy. Binary image bytes are never base64-encoded into SQLite or held wholesale in JavaScript. Native asset methods canonicalize paths beneath controlled roots before moving or deleting files.

Legacy iOS sources under App Group `capture-assets/committed` are adopted in a
bounded foreground pass. The database reference changes only after the
host-private copy exists, so interruption converges on retry without exposing the
authoritative task database to the extension.

## Security and privacy

Universal Capture treats all external data as untrusted. It uses allowlists, bounded sizes/counts, HTTP(S)-only URL parsing, sanitized display names, controlled file destinations, canonical path checks, and parameterized SQL. It never executes shared content, evaluates markup, opens it automatically in a WebView, trusts an extension alone, or logs text, URLs, image data, notes, or titles.

Local events are limited to `capture_received`, `capture_reviewed`, `capture_committed`, `capture_discarded`, and `capture_failed`, with ingress, combined payload kind, latency/failure buckets where available, and no private content. Diagnostics expose counts, last ingress, last failure category, last successful drain time, and orphan temporary asset count.

## CNG and build architecture

All native work is reproducible from committed sources. The local Expo Module owns native ingress, capabilities, and asset operations. Its config plugin uses structured Android manifest and iOS entitlement mods. The Xcode project mod creates and embeds the extension target, copies known committed source files, sets explicit build properties, and fails loudly when target structures are unavailable. It does not regex-patch generated native source.

Because Expo CNG support for iOS App Extensions is experimental, `app.json` also
declares `AetherShareExtension` under
`extra.eas.build.experimental.ios.appExtensions` for EAS target credential
discovery. This declaration does not replace a full Xcode/signing validation.

Run native validation in a clean isolated prebuild:

```bash
bun test
bun run typecheck
bun run lint
npx expo config --type introspect
npx expo prebuild --clean --no-install
```

Then compile a development build. Expo Go cannot load the module, TileService, Share Extension, or App Intents.

## Physical-device gates

Before beta, complete the full Android matrix on representative Pixel, Samsung, and another available OEM: shares from browser/gallery/text apps, cancel/malformed/duplicate/cold/warm/background/dead-process/rotation/offline cases, tile add/remove/locked/cold/warm cases, launcher shortcut, Android back, and repeated navigation loops. Capture `adb logcat` for crashes.

Complete iPhone/iPad physical validation from Safari, Photos, Files, and Notes; cancellation, extension termination, duplicate delivery, offline/App Group/drain behavior; App Intent/App Shortcut through Shortcuts, Siri, and Spotlight; portrait, landscape, Split View, and Stage Manager/resizable layouts.

The authoritative status and closure evidence for every native, device, API 36,
asset-authority, and release-size gate is maintained in
[`KNOWN_TRADEOFFS.md`](KNOWN_TRADEOFFS.md).

## Known limitations and future ingress

- Universal Capture v1 supports only text, exact HTTP(S) URLs, and one bounded image.
- Images are contextual references only; no OCR or semantic interpretation exists.
- iOS accepted captures are committed when the main app runtime next becomes available.
- Apple capability/signing, extension discovery, Siri phrasing, OEM sharesheet behavior, locked-device tile behavior, and file-provider quirks require signed physical-device evidence.
- Orphan counts require a storage scan supplied to the diagnostics API; automated cleanup can be added after device validation establishes safe provider behavior.

Future surfaces can add thin ingress adapters for widgets, Control Center, wearables, location, documents, or optional enrichment. They must preserve the same contract and may not become alternate task systems.
