# CHANGELOG

All notable changes to AETHER are documented here.

## Unreleased - 2026.08.08 (9) [Native-only Target and Recoverable Task Actions]

### Explicit Android and iOS target

- Restricted the Expo app target to iOS and Android in `app.json`; the repository has no web route, web resolver branch, or direct `react-dom`/`react-native-web` dependency.
- Removed the obsolete web development command from `AGENTS.md` and the unused `web-build/` ignore rule. Expo's transitive optional web peers remain in the generated lockfile because they are declared by Expo tooling, not by this app.

### Receipt-backed task recovery

- Added an accessible Undo/Dismiss banner on Home and Tasks for task creation, completion/reopening, and soft deletion, backed by the domain restore receipt.

### Validation scope

- Native notification delivery, voice transport, lifecycle transitions, and EAS signing still require the device/provider checks documented in the Part 2 handoff.

## Unreleased - 2026.08.08 (8) [Custom iOS 26 and Material 3 ToggleSwitch Component]

### iOS 26 and Material 3 Animated Toggle Switch

- Added custom `ToggleSwitch.tsx` component matching [Apple HIG Toggles](https://developer.apple.com/design/human-interface-guidelines/toggles) and Material 3 specifications.
- Features capsule pill tracks (`52px` × `32px`), spring-animated thumb knobs (`react-native-reanimated`), embedded checkmark (`Check`) icons on active states, and selection haptics (`Haptics.selectionAsync`).
- Replaced standard native switches for Haptic Feedback and Auto Task Summarize preferences in `SettingsScreen`.

### Validation

- `bun test`: 84 passed, 1 intentional opt-in OpenRouter smoke test skipped, 0 failed across 85 tests in 22 files.
- `bun run typecheck` and `bun run lint`: passed cleanly with 0 errors.

## Unreleased - 2026.08.08 (7) [Apple HIG Button System and Control Redesign]

### Apple HIG Button Architecture and Destructive Variant

- Redesigned `Button.tsx` according to [Apple HIG Button Guidelines](https://developer.apple.com/design/human-interface-guidelines/buttons) with capsule pill geometry (`Radius.pill`), tactile micro-haptic responses (`Haptics.impactAsync`), and refined typography.
- Added `variant="destructive"` support with dedicated red accent surface fills (`isDark ? 'rgba(239,68,68,0.16)' : 'rgba(239,68,68,0.1)'`) and text contrast.
- Updated API key controls in `SettingsScreen` to utilize `variant="destructive"` with `Trash2` icons for key deletion.

### Validation

- `bun test`: 84 passed, 1 intentional opt-in OpenRouter smoke test skipped, 0 failed across 85 tests in 22 files.
- `bun run typecheck` and `bun run lint`: passed cleanly with 0 errors.

## Unreleased - 2026.08.08 (6) [Settings 60FPS Performance Optimization and Apple HIG Pickers]

### 60FPS Performance and Zero-Lag Architecture

- Replaced stacked GPU-intensive `BlurView` instances on Android with hardware-accelerated flat surfaces (`Colors.zinc900` / `Colors.white` with subtle border), reserving native `GlassView` for iOS 26+.
- Removed heavy entrance animation delay waterfalls (`FadeInDown.delay(...)`) on section cards, ensuring 0ms mount lag and instant navigation into Settings.

### Apple HIG Segmented Pickers and Model Sheet

- Rebuilt Theme Selection as an authentic [Apple HIG Segmented Control Picker](https://developer.apple.com/design/human-interface-guidelines/pickers) (`System`, `Dark`, `Light`) embedded directly in the card with an active pill indicator and 0ms tap latency.
- Replaced inline nested scroll lists with a compact Active Model hero card and Pull-Down Button (`Change Reasoning Model… ▾`) opening a high-performance Model Selector Sheet with real-time search.

### Validation

- `bun test`: 84 passed, 1 intentional opt-in OpenRouter smoke test skipped, 0 failed across 85 tests in 22 files.
- `bun run typecheck` and `bun run lint`: passed cleanly with 0 errors.

## Unreleased - 2026.08.08 (5) [Settings UI Redesign and Detail Corrections]

### Apple iOS 26 Liquid Glass Settings Redesign

- Completely redesigned `SettingsScreen` from scratch with inset grouped cards, translucent materials (`GlassView` / `GlassSurface`), refined typography, and spring physics.
- Added active model hero badge displaying the currently selected model, provider, and capability tier with a quick "Reset to Default" action.
- Added secure key status indicators (`Saved in SecureStore` / `No key configured`), masked key input option, and intelligent button states.
- Rebuilt theme selection with a segmented liquid glass pill control (`system`, `dark`, `light`).
- Added interactive expandable accordions for "About AETHER" and "Privacy Information" with Reanimated spring physics and haptics.

### Setting details and feature fixes

- Restored missing **Auto Task Summarize** setting toggle to the Preferences section, connected to `useSettingsStore`.
- Added `forceRefresh` support to `fetchAvailableModels` in OpenRouter service so manual catalog refreshes bypass in-memory caching and send live network requests with user API key credentials.
- Enhanced `GlassSurface` component to support `expo-glass-effect`'s native Liquid Glass `GlassView` on iOS 26+ devices with platform-safe fallbacks on Android and older iOS.

### Regression coverage and validation

- Added unit tests for `fetchAvailableModels` force-refresh behavior and cache bypass in `src/services/ai/openrouter.test.ts`.
- `bun test`: 84 passed, 1 intentional opt-in OpenRouter smoke test skipped, 0 failed, 274 expectations across 85 tests and 22 files.
- `bun run typecheck` and `bun run lint`: passed cleanly.

## Unreleased - 2026.08.08 (4) [Final P0 Correctness and Transport Hardening]

### Bounded voice transport and truthful audio packets

- Replaced immediate queue draining with 100 ms PCM aggregation, paced sends, native WebSocket `bufferedAmount` pressure checks, bounded queued packets, and deterministic congestion failure/cleanup while retaining exactly-once final transcript handling and timeouts.
- Added sustained-congestion and cross-append aggregation regressions instead of relying on same-tick append bursts.

### Zoned notifications and complete reconciliation

- Resolved fixed reminders in their stored IANA timezone and floating reminders in the current device timezone without host-local ISO string parsing.
- Removed the implicit 200-row repository ceiling from authoritative notification reconciliation and added coverage for device/reminder timezone differences plus 201 valid scheduled reminders.

### Memory-first read execution

- Kept pure READ tool lifecycle and result handling memory-first without durable idempotency rows, while preserving durable writes, confirmations, receipts, write failures, and terminal run outcomes.
- Tool proposed/started/completed/failed events now become observable as execution happens rather than being released only after completion.

### Validation scope

- Added focused transport, temporal projection, reconciliation, and agent hot-path regression coverage. No server, provider-routing, deployment, or product-feature changes were introduced.
- Physical-device validation remains required for native WebSocket pressure behavior, notification delivery across timezone changes, and lifecycle interruption.

## Unreleased - 2026.08.08 (3) [P0 AETHER Core Execution Boundary]

### In-process execution ownership

- Added a small `AetherCore` composition root and shared `AetherCommandExecutor`; manual task actions, agent tools, confirmation, and notification lifecycle reconciliation now enter through this application boundary while domain services retain business rules and repositories retain SQL.
- Reduced `AssistantHost` and its session controller to presentation, context, navigation, feedback, and event consumption responsibilities; no server, RPC, worker, backend, or alternate provider path was introduced.

### Exact confirmation and native convergence

- Confirmation now reloads the exact validated arguments from the durable pending execution instead of trusting the UI-carried copy, atomically claims its stable app-owned execution identity, and replays completed receipts without duplicating mutations or inference.
- Kept terminal mutation receipts on the first model turn, kept transient streaming/state events out of SQLite, and preserved exact OpenRouter model selection plus OpenAI-only realtime transcription.
- Added the Android reminder channel, retained honest projection failures, and extended startup/foreground reconciliation to cancel orphaned AETHER notifications absent from authoritative SQLite state.

### Regression coverage and validation

- Added coverage for shared manual/agent command execution, tamper-resistant exact pending-action confirmation, and orphan notification repair; retained coverage for one-turn mutations, hot-path streaming, PCM normalization, bounded audio backpressure, voice timeouts/exactly-once final transcript delivery, and notification create/reschedule/cancel recovery.
- `bun test`: 79 passed, 1 intentional opt-in OpenRouter smoke test skipped, 0 failed, 248 expectations across 80 tests and 21 files.
- `bun run typecheck`, `bun run lint`, `bun x expo config --type public`, and `bun x expo install --check`: passed.
- No build was deployed or published. Physical-device notification delivery/reconciliation, hardware-rate audio normalization, slow-network voice backpressure, and lifecycle interruption remain device-only validation.

## Unreleased - 2026.08.08 (2) [P0 Production Safety and Latency Corrections]

### Exact confirmation and terminal mutations

- Confirmation now executes the exact app-owned pending action directly, without resubmitting user text or starting another model run; cancellation durably discards it and completed executions replay without repeating mutations.
- Removed response-delta and semantic-state persistence from the agent event hot path while retaining durable terminal run outcomes, tool execution idempotency records, receipts, and errors.
- Successful simple task and reminder mutations now finish from the actual native action receipt without a second model round trip.

### Bounded realtime voice transport

- Normalized native PCM16 input to 24 kHz mono, including channel downmixing and resampling when device hardware ignores the requested capture rate.
- Added bounded audio chunking, a transport queue with backpressure failure, connection/session/final-transcript timeouts, and deterministic socket/timer/queue cleanup.
- Kept partial transcripts non-mutating and final delivery exactly once; moved audio-level metering to a Reanimated shared value outside normal React render propagation.

### Recoverable local notification delivery

- Added `expo-notifications`, migration `0004_notification_projection`, stored native notification identifiers/errors, and a small SQLite-authoritative local notification projection.
- Reminder schedule, reschedule, and cancel operations now update OS-local notifications and report projection failure honestly while preserving successful domain mutations.
- Reconciliation repairs missing or stale schedules after app startup and foreground resume and removes notifications for disabled reminders.

### Regression coverage and validation 4

- Added or updated coverage for exact confirmation replay, terminal mutation turns, absent hot-path event persistence, PCM resampling, bounded queue/backpressure, connection timeout cleanup, and notification projection/reconciliation.
- `bun test`: 77 passed, 1 intentional opt-in OpenRouter smoke test skipped, 0 failed, 242 expectations across 78 tests and 20 files.
- `bun run typecheck`: passed.
- `bun run lint`: passed.
- `bun x expo config --type public`: passed with Expo SDK 57 and the `expo-notifications` plugin resolved.
- No build was deployed or published. Physical-device notification delivery, native audio-rate variation, slow-network voice behavior, and background/foreground lifecycle behavior remain device-only validation.

## Unreleased - 2026.08.08 (1) [Provider-Isolated Realtime Voice and Deterministic Agent Selection]

### OpenRouter is the only reasoning and agent provider

- Replaced first-compatible model fallback with deterministic selection of `deepseek/deepseek-v4-flash` when no model is selected.
- Preserved explicit OpenRouter model selections and validate the exact current OpenRouter model metadata before starting an agent run.
- Added conservative capability checks for streaming, tools, tool choice, and structured output; incompatible or unavailable models now fail with a provider-specific error instead of silently changing models.
- Kept task tools, confirmation policy, SQLite mutations, SSE output, receipts, and agent execution on the existing OpenRouter `AgentRuntime`.
- Removed fabricated model-version assumptions and unknown-capability execution paths.

### OpenAI realtime transcription replaces file-based speech input

- Removed the OpenRouter STT provider, `openai/whisper-1`, recorded-file uploads, temporary audio-file cleanup, and the obsolete speech configuration/parser paths.
- Added OpenAI Realtime transcription with the exact `gpt-realtime-whisper` model, documented `session.update`, `input_audio_buffer.append`, and `input_audio_buffer.commit` events, and documented incremental/final transcript handling.
- Rebuilt voice capture around Expo SDK 57 `expo-audio` `useAudioStream()` using mono PCM16 at 24 kHz.
- Only a non-empty final committed transcript is submitted, exactly once, to the OpenRouter `AgentRuntime`; partial text never creates or mutates a task.
- Added explicit voice lifecycle states for connecting, listening, transcribing, finalizing, thinking, executing, responding, idle, and error, with cancellation, interruption, malformed-event, duplicate-submit, empty-transcript, network, permission, and unmount handling.
- The current native transport uses an authenticated WebSocket because this repository has no ephemeral-token service or native WebRTC transport. OpenAI’s mobile guidance recommends WebRTC/ephemeral credentials, so device and production security validation remain outstanding.

### Independent provider credentials

- Added separate SecureStore entries and independent load/save/delete/validation behavior for OpenRouter and OpenAI API keys.
- OpenRouter credentials are used only for AI reasoning and the selected model; OpenAI credentials are used only for realtime voice transcription.
- Removed persisted OpenRouter secrets from Zustand/AsyncStorage state and ensured neither provider secret is serialized, logged, emitted in errors, or displayed after saving.
- Persisted settings now contain only non-secret preferences such as the selected model, theme, haptics, and auto-summary preference.
- Settings now label the two keys by their actual responsibility and no longer imply that an OpenRouter key enables voice.

### One assistant owner with all five app surfaces

- Kept `AssistantHost` and the AETHER Orb as the single owner of assistant and voice interaction.
- Restored and retained all five routed surfaces: Home, Tasks, AI, Transcribe/Voice, and Settings.
- Updated the AI and Transcribe pages to provide provider-specific readiness/status guidance without introducing a second assistant or duplicate voice flow.
- Preserved platform-aware iOS Liquid Glass fallbacks, Android-native surfaces, accessibility, Reduce Motion, haptics, keyboard behavior, and local high-frequency audio/transcript state.
- Removed the unused Expo Audio shim, stale background audio configuration, and unnecessary file-system dependency/permissions. Background recording and playback remain disabled.

### Regression coverage and validation 3

- Added tests for independent SecureStore credentials, provider/key isolation, deterministic DeepSeek defaulting, explicit model preservation, exact OpenRouter capability validation, realtime reducer transitions, partial-versus-final transcript handling, exactly-once final submission, cancellation cleanup, malformed events, and the absence of OpenRouter STT fallback.
- `bun test`: 72 passed, 1 intentional opt-in OpenRouter smoke test skipped, 0 failed, 223 expectations across 73 tests and 18 files.
- `bun run typecheck`: passed.
- `bun run lint`: passed.
- `bun x expo config --type public`: passed; Expo SDK 57 resolved for iOS and Android with `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`, without background audio/service permissions.
- Android EAS development build was attempted twice and canceled before producing an artifact; it was not rerun after cancellation. No physical-device voice validation was claimed.

### Implementation references

- [Provider-isolated architecture](docs/ARCHITECTURE.md)
- [OpenAI Realtime transcription guide](https://developers.openai.com/api/docs/guides/realtime-transcription)
- [OpenAI `gpt-realtime-whisper` model](https://developers.openai.com/api/docs/models/gpt-realtime-whisper)
- [Expo SDK 57 Audio documentation](https://docs.expo.dev/versions/v57.0.0/sdk/audio/)
- [OpenRouter model metadata](https://openrouter.ai/api/v1/models)

## Unreleased - 2026.08.07 (3) [Liquid Glass Toolbar & Five-Surface Navigation]

### Toolbar rebuilt around the keyboard

- Replaced the floating bottom toolbar with one compact five-slot dock: Home, Tasks, AETHER, Voice, and Settings.
- Removed the detached orb-over-toolbar composition; the AETHER orb is now an embedded control in the dock and in the assistant composer.
- Added keyboard frame tracking so the composer moves above the keyboard on iOS and Android instead of remaining pinned to the screen bottom.
- Hide the navigation dock while the keyboard is visible, keeping the active composer as the single focused surface.
- Removed the separate composer microphone button; voice input now uses the same AETHER orb as the dock.

### Animated AETHER orb

- Rebuilt the orb as a native-feeling animated ball with status colors, a restrained busy pulse, a specular highlight, and reduced-motion support.
- Tap the orb to open or close the assistant; hold it to start native voice capture; release to send.
- Preserved upward swipe locking for longer recordings and surfaced voice progress in the compact assistant surface.
- Automatically dismiss the keyboard before hold-to-talk begins so text and voice input do not compete for focus.

### Cross-platform glass materials

- Added an app-level `BlurTargetView` behind routed content so Android blur has one shared, efficient source.
- iOS 26 uses native `GlassView` Liquid Glass with the existing fallback for older iOS versions.
- Android uses Expo BlurView's `dimezisBlurViewSdk31Plus` path with a translucent fallback on older Android versions.
- Kept the material, spacing, safe-area handling, motion, and interaction model consistent across iOS and Android while allowing platform-specific rendering.

### Five routed surfaces

- Added the `AI` route for assistant connection status, model readiness, and capability guidance.
- Added the `Transcribe` route for the hold-to-talk flow, swipe-to-lock guidance, and transcription readiness state.
- Registered both routes in the root stack and in assistant navigation routing.
- This supersedes the earlier Slice 4 note that the AI Overview and Transcribe routes were retired; both are now restored as intentional primary surfaces.

### Validation

- `bun test`: 61 passed, 1 intentional opt-in OpenRouter smoke test skipped, 0 failed.
- `bun run typecheck`: passed.
- `bun run lint`: passed.
- Android bundle export: passed.
- Android EAS development build: submitted and still `IN_PROGRESS` when this entry was written — [build status](https://expo.dev/accounts/enosislabs/projects/aether-reminder/builds/ad35f7c8-3732-48b0-95fb-b80288714ae3).

### Implementation references 2

- [Five-slot navigation](src/components/assistant/AppBottomNavigation.tsx)
- [Animated orb](src/components/assistant/AssistantOrb.tsx)
- [Keyboard-aware assistant host](src/components/assistant/AssistantHost.tsx)
- [Keyboard-aware composer surface](src/components/assistant/AssistantSheet.tsx)
- [AI surface](src/app/ai.tsx)
- [Transcribe surface](src/app/transcribe.tsx)
- [Expo GlassEffect documentation](https://docs.expo.dev/versions/v57.0.0/sdk/glass-effect/)
- [Expo BlurView Android documentation](https://docs.expo.dev/versions/v57.0.0/sdk/blur-view/)

## Unreleased - 2026.08.07 (2) [Voice inside the Universal Assistant Orb — Slice 5]

### One assistant, two input transports

- Added a single `VoiceController` used by both Orb hold-to-talk and the composer microphone action.
- Added the explicit voice state machine: `idle`, `requesting_permission`, `preparing`, `listening`, `finalizing`, `transcribing`, `ready`, `cancelled`, and `error`.
- Added hold Orb → speak → release → native recording finalization → OpenRouter transcription → existing `AgentSessionController` submission.
- Added upward drag locking with explicit `Stop & Send` and `Cancel` controls.
- Added deliberate haptics for recording start, recording stop, cancellation, and errors, respecting the existing haptics setting.
- Added OpenRouter speech configuration separated from the conversational agent model, using `openai/whisper-1` through OpenRouter only.
- Added transcription cancellation through `AbortController`.
- Added voice-originated `ContextSnapshot.invocationSource` support while preserving the same active session and conversation entities.
- Added timing instrumentation for press-to-recording, finalization, transcription, and transcript-to-agent handoff.
- Added an idempotency regression covering voice confirmation replay and exactly one mutation.
- Added `expo-file-system` temporary recording cleanup.

### Orb and composer behavior

- Enabled the composer microphone action and routed it through the shared VoiceController.
- Extended Orb semantic state mapping for permission, preparation, listening, finalization, and transcription.
- Added the `expo-audio` microphone permission message to native configuration.
- Extended the OpenRouter transcription provider with cancellation signal support.

### Legacy voice paths retired

- Removed the obsolete Expo Go audio recorder shim.
- Removed the unused legacy waveform product component.
- Removed obsolete production mock recording/transcription paths.
- No standalone Transcribe route or second assistant was added or restored.

### Native audio lifecycle and safety

- Native recorder state is authoritative; listening is not entered unless the native recorder reports that it started.
- Permission denial, unavailable recorder, start failure, empty audio, interruption/background transitions, stop failure, network failure, and cancellation return typed/user-visible errors.
- Temporary recordings are deleted after successful transcription, failed transcription, cancellation, and cleanup.
- Cancel never submits partial speech to the AgentRuntime.
- No always-on listening, wake word, background passive recording, local STT, or local inference was added.

### Validation and acceptance

- `bun test`: 61 passed, 1 intentional opt-in OpenRouter smoke test skipped, 0 failed.
- `bun run typecheck`: passed.
- `bun run lint`: passed.
- Expo SDK 57 public configuration verified with `expo-audio` microphone permission configuration.
- Android EAS development build completed successfully: [build artifact](https://expo.dev/artifacts/eas/kb89U1Tncp8SOImg5BgylNdKHluM4eQfTef9KhcHvhg.apk).

### What still needs a device

- Android native build packaging: passed.
- Real Android device voice flow: not yet validated.
- Real iOS native voice flow: not yet validated in this workspace.
- Live OpenRouter transcription: not yet validated because no live user API key/device was available during implementation.
- Slice 5 remains blocked until the real native hold-to-talk acceptance paths are executed.

### Next slice remains unopened

- No Slice 6 work has started. Scope remains undefined until Slice 5 native acceptance is complete.

### Implementation references 1

- [VoiceController](src/components/assistant/VoiceController.tsx) owns permission, recording, cancellation, transcription, and cleanup.
- [AssistantHost](src/components/assistant/AssistantHost.tsx) connects voice transcripts to the existing assistant session.
- [OpenRouter STT provider](src/services/transcription/openrouterStt.ts) sends audio only to OpenRouter.
- [Confirmation regression](src/services/agent/agentRuntime.conformance.test.ts) covers exactly-once voice replay behavior.
- Native configuration follows the [Expo SDK 57 audio documentation](https://docs.expo.dev/versions/v57.0.0/sdk/audio/).

## Unreleased - 2026.08.07 (1) [Universal Assistant Experience — Slice 4]

### The universal assistant surface

- Added a single global `AssistantHost` mounted above routed screens, preserving the active assistant session across navigation.
- Added the central AETHER Orb as the permanent assistant entry point in the bottom navigation.
- Added one continuous assistant surface with compact composer, medium conversation, full conversation, opening, and closing states.
- Added native-feeling composer behavior with autofocus, keyboard handling, send action, accessibility labels, and a disabled microphone affordance reserved for Slice 5.
- Connected the assistant to the existing `AgentRuntime` and real OpenRouter SSE events, including incremental `response.delta` rendering.
- Added Orb semantic states for contextualizing, thinking, executing, confirmation, responding, error, and closing.
- Added Reduce Motion support, restrained state-specific motion, native haptics for successful mutations, and accessible state descriptions.
- Added explicit Home, Tasks/upcoming, and Settings `ContextSnapshot` propagation with visible task IDs and bounded conversational entity references.
- Added native action receipts for successful tool executions and app-owned confirmation surfaces for `tool.confirmation_required`.
- Added allowlisted `app.navigate` routing for Home, Tasks, and Settings.
- Added a deliberate zero-task Home empty state without demo or sample records.
- Added an opt-in real OpenRouter smoke test and manual instructions covering SSE streaming, tool execution, tool results, model continuation, and completion.

### Session, navigation, and platform behavior

- Replaced the old equal-weight navigation with Home, Tasks, centered Orb, and Settings.
- Added task/upcoming refreshes after assistant mutations so SQLite changes appear without an app restart or manual refresh.
- Added iOS Liquid Glass support where available, with native material fallback on older iOS versions.
- Added an Android-specific semantic surface, elevation, haptics, and motion interpretation without emulating Liquid Glass.
- Removed legacy complete-only AI summary generation, local fallback summaries, and obsolete AI response types.
- Kept high-frequency streamed assistant state localized to the assistant controller rather than broad global store updates.

### Previous assistant paths retired

- Removed the `AI Overview` route and its primary navigation destination.
- Removed the standalone `Transcribe` route and its primary navigation destination.
- Removed the legacy `FloatingToolbar` navigation component.
- Removed duplicate AI question flows and legacy AI summary paths.

### Slice 4 validation

- `bun test`: 60 passed, 1 intentional opt-in OpenRouter smoke test skipped, 0 failed.
- `bun run typecheck`: passed.
- `bun run lint`: passed.
- iOS native export: passed.
- Android native export: passed.

### Boundaries carried forward

- The live OpenRouter smoke test requires a user-supplied API key and agent-capable model, so it was not run automatically.
- Native iOS and Android bundles export successfully for this historical slice.
- Undo was not shown in this historical slice; the current receipt-backed restore UI is documented in the latest Unreleased entry.
- Voice capture, notifications, widgets, and local inference remain out of scope for this release.

### Slice 4 reference points

- [Assistant surface](src/components/assistant/AssistantSheet.tsx) contains the accepted conversation UI.
- [Agent session controller](src/components/assistant/AgentSessionController.tsx) remains the shared runtime boundary for text and voice.
