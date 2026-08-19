# CHANGELOG

All notable changes to AETHER are documented here.

## Unreleased - 2026.08.19 (1) [Android Route Render Pipeline]

### Measured route-work correction

- Profiled only the route subtrees on the physical 90 Hz Samsung SM-A176B and
  identified repeated database projection reads plus assistant snapshot context
  invalidation as the dominant navigation costs. Before correction,
  `RemindersScreen` reached 80.85 ms during hot navigation and 447.67 ms during
  a refresh, `TodayScreen` reached 109.30 ms, and `ScheduleScreen` reached
  66.09 ms.
- Added load guards that reuse the Today and Upcoming projections for the current
  local date, reuse the complete Reminders projection after its initial load, and
  regenerate Smart Recovery only after the task revision changes. Explicit
  mutation, capture, assistant, recovery, and database-recreation refresh paths
  remain authoritative and continue to republish every projection.
- Split the assistant snapshot reader and stable snapshot writer into separate
  contexts. Focused routes can publish assistant context without making every
  mounted route subscribe to changes from another route.
- After correction, measured route renders fell to 29.14 ms for Today, 12.92 ms
  for Schedule, and 37.19 ms for Reminders; inactive route callbacks fell to
  0.04–0.06 ms.

### Release optimization and physical evidence

- Enabled Android release R8/minification and resource shrinking through the
  versioned `expo-build-properties` configuration. The arm64 release APK reduced
  from 113 MB to 75 MB. No broad application keep rule or
  `android.enableR8.fullMode=false` override was added.
- Verified a non-debuggable production bundle with Hermes bytecode,
  `__DEV__ = false`, React Native New Architecture, minSdk 31, compile/target SDK
  36, and no dev-launcher or dev-menu entries in the shrunk APK. Kotlin remains
  2.1.20 with its existing K2 compiler path; no runtime performance claim is
  attributed to K2.
- In matched warmed release navigation, normal p50/p95 improved from 10/44 ms to
  8/13 ms and jank from 10.74% to 3.91%. The 36-change stress sequence improved
  from 10/23 ms to 9/18 ms and from 2.43% to 2.15% jank. At the measured 90 Hz
  refresh rate, budget-relative frame-overrun p95 improved from 32.89 ms to
  1.89 ms normally and from 11.89 ms to 6.89 ms under stress.
- Normal PSS/native heap changed from 354,969/77,260 kB to
  223,822/68,052 kB; stress PSS/native heap changed from
  278,726/78,636 kB to 250,164/77,976 kB. Attached views remained 83 normally
  and 256 under stress.

### Validation and preserved rendering

- `bun install --frozen-lockfile`, 390 Bun tests, strict typecheck, Expo lint,
  AetherMotion Android unit tests, release Kotlin compilation, R8 release
  assembly, physical release installation, normal/stress navigation, assistant
  open/close, Android back, screenshots, logcat, `dumpsys gfxinfo`, and
  `dumpsys meminfo` completed. Lint retains only the pre-existing unreachable-code
  warning in `src/services/agent/runtime.ts`.
- The unitary Voice button, navigation geometry, visual design, Reanimated
  configuration, Dimezis 3.2.0, native blur hierarchy, and
  `setupWith(target, 4f, false)` are unchanged. Physical validation found no blur,
  touch, back-navigation, or visual regression.
- Release builds already consume dependency ART and Startup Profiles. A
  project-owned Baseline Profile generator and Macrobenchmark module remain the
  next dedicated performance gate rather than being mixed into the route fix.

## Unreleased - 2026.08.18 (1) [Stable Android Blur Navigation]

### RenderNode blur composition under rapid navigation

- Updated only Dimezis BlurView from 3.1.0 to 3.2.0, retaining the existing
  native RenderNode/RenderEffect path, `setupWith(target, 4f, false)`, real
  window frame-clear drawable, tint semantics, and exact navigation styling.
- Added development-only native lifecycle tracing and a dependency-resolution
  regression test. Physical traces confirmed the two blur views, shared target,
  dimensions, and controllers remain stable across 45 rapid tab presses with
  zero remounts or repeated `setupWith` calls.
- On a 90 Hz Samsung SM-A176B running API 36, the matched debug-build stress
  capture improved from 27.47% to 18.89% janky frames; calculated frame-overrun
  p95 improved from 19.52 ms to 5.42 ms. The platform screen recording showed
  no gray, black, or stale blur frame after the update, but its capture cadence
  was below the panel's 90 Hz refresh and cannot exclude a sub-frame artifact.

### Validation

- `:aether-motion:compileDebugKotlin`, `:aether-motion:testDebugUnitTest`, and
  `:app:assembleDebug` passed with Dimezis 3.2.0 resolved. Physical install,
  launch, repeated navigation, screenshots, screen recordings, lifecycle
  logcat, and `dumpsys gfxinfo framestats` were captured on the Samsung device.
- The authenticated EAS Android development build could not start because the
  account's monthly Android build quota was exhausted. Repository-wide Bun
  tests retain three unrelated Expo test-harness failures where `__DEV__` is
  undefined; the focused Android blur regression passed 7/7.
- No Apple rendering, shared visual styling, blur scale, noise, Reanimated
  feature flags, or native fallback behavior changed.

## Unreleased - 2026.08.16 (7) [Cloud-First Usage and BYOK Removal]

### Hosted capabilities governed by AETHER Cloud

- Removed all user-owned OpenAI/OpenRouter key setup, validation, provider
  selection, direct provider fallback, and model-routing UI from Mobile.
- Added bounded, replay-safe deletion of the two legacy AETHER provider-key
  SecureStore entries without reading their values.
- Added the server-authoritative Usage surface for plan, AI requests, voice
  minutes, optional automations, reset timing, and unavailable/quota states.
- Added strict Mobile decoding for the future `GET /v1/me/usage` Cloud
  contract; until Cloud implements it, Mobile presents honest unavailable
  usage rather than fabricated counters.
- Added release-time HTTPS Cloud-origin validation while development keeps
  local Reminder functionality available without Cloud configuration.

### Verification

- `bun run test` now isolates test files to prevent mock leakage; 379 tests
  pass across 72 Mobile files. `bun run typecheck` passes and `bun run lint`
  reports only the existing unreachable-code warning in agent runtime.

## Unreleased - 2026.08.16 (6) [AETHER Cloud Client Integration]

### Hosted Cloud path without replacing local authority

- Added one `AetherCloudClient` for health, commercial policy, voice
  authorization, and hosted assistant SSE. UI components do not construct
  Cloud requests.
- Hosted voice asks Cloud for an ephemeral OpenAI client secret immediately
  before the existing Realtime WebSocket opens. The secret stays in memory
  and is not written to SQLite, SecureStore, or AsyncStorage.
- Hosted assistant turns send `assistant.turn` / `aether.tasks.v1` and execute
  `list_tasks` / `propose_task_mutation` locally. Cloud does not mutate SQLite.
- User-owned BYOK OpenRouter and OpenAI keys remain when Cloud is not
  configured. No AETHER-owned provider master key is added to Mobile.

### Local development configuration

- Public build-time URL: `EXPO_PUBLIC_AETHER_CLOUD_URL`.
- Deterministic development identity: `e2e.mobile.physical.aether-reminder`.
- Documented in `docs/AETHER_CLOUD_INTEGRATION.md`. Physical-device evidence
  is still required to close the Cloud mobile E2E gate.

## Unreleased - 2026.08.16 (5) [Native Material 3 Alert Dialogs]

### Canonical native alert migration

- Added the typed `AetherAlertDialog` semantic adapter with a real Expo UI
  Jetpack Compose Material 3 `AlertDialog` implementation on Android and a
  native SwiftUI alert implementation across iOS/iPadOS.
- Migrated application-owned alerts in `src/app/settings.tsx` and
  `src/app/_layout.tsx`, preserving API-key, database-recovery, destructive
  confirmation, Adaptive Nudges, haptic, and persistence behavior.
- Added a scoped ESLint guard preventing new `react-native` `Alert` imports or
  `Alert.alert(...)` calls in product source.
- Preserved the centralized Material You bridge, bounded AETHER accent budget,
  OLED canvas, native Compose Switch/DateTime/Sheet paths, and documented the
  appearance-control decision in `docs/THEMING.md`.

### Validation and remaining runtime gate

- `bun run typecheck`, `bun run lint`, focused dialog tests (4 passed), and
  `bunx expo export --platform android` passed.
- Full `bun test` remains environment-blocked: cloud tests require an unset
  `DATABASE_URL`, and the app scope retains existing React Native test-loader
  errors in `Picker.test.tsx` and `AnimatedPressable.test.tsx`.
- Android visual Material 3 validation remains open because no ADB device or
  local emulator was available; no physical-device result is claimed.

## Unreleased - 2026.08.16 (4) [Unified Semantic Theme and Material You Resolver]

### Wallpaper-derived color source with AETHER-owned identity

- Replaced the incomplete Material 3 baseline-color path with a centralized
  `@expo/ui/jetpack-compose` bridge that calls `getMaterialColors({ scheme })`
  without `seedColor` when Android 12+ Dynamic Color is enabled.
- Added capability-aware Android fallback behavior: below Android 12, AETHER
  remains monochrome and does not label the SDK static baseline as Material You.
- Kept OLED dark background, neutral raised surfaces, typography, structural
  borders, glass, and product status colors AETHER-owned while mapping dynamic
  `primary` / `onPrimary` and container roles into the bounded accent budget.

### Semantic and component-token migration

- Expanded the resolved `AetherTheme` contract with semantic border, focus,
  selected, disabled-control, composer, and shape roles.
- Migrated reusable controls, cards, fields, sheets, pills, navigation,
  composers, assistant surfaces, capture/settings surfaces, motion/glass
  adapters, and native Picker/Switch/DateTime adapters to the shared resolver.
- Preserved native-first behavior and kept native Host palettes aligned with the
  resolved source; wallpaper mode omits Host seeds, while AETHER fallback mode
  uses an explicit AETHER accent seed only where the native Host requires one.

### Theme documentation and validation coverage

- Added [`docs/THEMING.md`](docs/THEMING.md) and synchronized token/Material You
  guidance in `AGENTS.md` and `CLAUDE.md`.
- Added deterministic resolver and native palette-bridge tests for appearance,
  capability fallback, role mapping, OLED invariants, status colors, shape and
  anti-purple regressions. Physical Android/iOS/iPadOS validation remains
  user-owned and was not performed.

## Unreleased - 2026.08.16 (3) [Interaction Feedback Shape Consistency]

### Shape-aware Pressable feedback across AETHER surfaces

- Fixed the systemic mismatch where rounded controls could receive rectangular
  pressed or Android ripple feedback across the larger touch target.
- Extended [`AnimatedPressable`](src/components/ui/AnimatedPressable.tsx) with
  optional `interactionRadius` support and bounded ripple configuration.
- Added `getMinimumTouchTargetHitSlop` so compact visual controls can preserve
  44/48dp platform touch targets without enlarging their feedback surface.
- Kept clipping opt-in and shape-specific; no blanket `overflow: "hidden"`
  behavior was added to all `AnimatedPressable` instances.
- Preserved scale motion, haptics, reduced-motion behavior, accessibility,
  native control mechanics, and externally-owned focus-ring behavior.

### Rounded control and surface migrations

- Migrated shape-aware feedback for Buttons, IconButtons, Cards, TaskCard's
  completion checkbox, ChoicePill, toolbar actions, composer actions, assistant
  voice/send actions, bottom navigation, model catalog rows, Picker/date controls,
  and Settings selectors.
- Kept TaskCard completion/product animation unchanged and left native sheets,
  toggles, pickers, and presentation architecture intact.
- Documented the design-system rule that interaction feedback shape must match
  visual surface shape while touch-target and feedback geometry remain separate.
- Added focused shared-contract coverage for minimum touch targets, pill and
  rounded feedback radii, bounded ripples, compact hit slop, no global clipping,
  and external focus-ring preservation.

### Validation status and gates

- Focused interaction tests: 6 passed.
- TypeScript: `bun run typecheck` passed.
- Linter: `bun run lint` passed.
- Source test suite: 354 passed, 2 skipped; two existing React Native mock-export
  harness errors remain in `Picker.test.tsx` and `ModelCatalogSheet.test.tsx`.
- Platform exports: `bunx expo export --platform android` and
  `bunx expo export --platform ios` passed.
- No native dependency or configuration changes were made, so no EAS build was
  required. No physical-device validation was performed by request.

## Unreleased - 2026.08.16 (2) [Native-First Settings Model Catalog Sheet Migration]

### Migration of Settings model catalog to native-first Sheet architecture

- Evaluated presentation options for the OpenRouter model catalog selection surface in Settings:
  - **Candidate A (`Sheet`) [CHOSEN]**: Transient sheet presentation delegating to `@expo/ui/community/bottom-sheet` (Jetpack Compose Material 3 `ModalBottomSheet` on Android and SwiftUI `sheet` on iOS/iPadOS). Correctly preserves in-situ selection semantics without unnecessary navigation stack complexity.
  - **Candidate B (`formSheet`) [REJECTED]**: Rejected as over-engineered because the catalog has no independent route identity, deep linking, history stack, or child routing needs.
- Extracted and created [`ModelCatalogSheet.tsx`](src/components/ui/ModelCatalogSheet.tsx):
  - Encapsulates OpenRouter catalog search, loading/error states, empty state, force refresh via `Sheet` `headerAction`, capability checking (`canRunAsAgent`), and model selection.
  - Configures native detents using `snapPoints={['90%']}`.
  - Respects AETHER semantic design tokens and accessibility guidelines.
- Refactored [`src/app/settings.tsx`](src/app/settings.tsx):
  - Completely removed React Native `Modal`, custom scrim overlay, fixed 75% height container, manual close button, and unused custom styling.
  - Replaced inline modal hierarchy with `<ModelCatalogSheet />`.
  - Cleaned up unused local state and helper utilities.
- Added comprehensive unit test coverage in [`ModelCatalogSheet.test.tsx`](src/components/ui/ModelCatalogSheet.test.tsx) testing native sheet rendering, search filtering, error/loading states, agent capability enforcement, disabled non-agent model selection, and refresh callbacks.
- Reconciled [`docs/NATIVE_FIRST_UI_AUDIT.md`](docs/NATIVE_FIRST_UI_AUDIT.md):
  - Reclassified Settings model catalog from N4 to N1 (semantic wrapper over native).
  - Reduced total N4 audit findings from 1 to 0 (all N4 findings resolved).
  - Updated executive counts (N1: 10, N4: 0) and marked Wave 3 roadmap item as COMPLETED.

### Validation status and gates

- Unit tests: `bun test src/components/ui/ModelCatalogSheet.test.tsx` (8/8 pass), `bun test src/` (all 353 unit tests pass).
- TypeScript: `bun run typecheck` (0 errors).
- Linter: `bun run lint` (0 errors).
- Platform export bundles: `bunx expo export --platform android` (clean), `bunx expo export --platform ios` (clean).
- Native compile: `./gradlew :app:compileDebugKotlin` (BUILD SUCCESSFUL).
- Device & runtime gates: No physical Android or iOS device attached. Full iOS Xcode build and physical device validation gates remain OPEN in `docs/KNOWN_TRADEOFFS.md`.

## Unreleased - 2026.08.16 (1) [Dead Context Menu Architecture Cleanup]

### Deletion of orphaned context menu architecture and audit reconciliation

- Audited and deleted unconsumed fake-native context menu architecture:
  - Deleted `src/components/ui/AetherContextMenu.tsx` (dead popup context menu).
  - Deleted `src/components/ui/AetherQuickActionsMenu.tsx` (dead quick actions menu).
  - Deleted `src/components/ui/AetherContextSurface.tsx` (orphaned internal popup surface with 0 consumers).
- Reconciled [`docs/NATIVE_FIRST_UI_AUDIT.md`](docs/NATIVE_FIRST_UI_AUDIT.md) to reflect current repository architecture:
  - Updated executive audit unit count to 32 (N0: 5, N1: 9, N2: 4, N3: 0, N4: 1, N5: 12, N6: 1).
  - Reclassified completed native primitives `Picker` and `ToggleSwitch` from N4/N3 to N1 (semantic platform adapters).
  - Removed deleted menu files and orphaned `AetherContextSurface` from audit tables.
  - Confirmed `Settings model catalog modal` as the sole remaining N4 candidate.
  - Updated Wave 1 roadmap to record `Picker` and `ToggleSwitch` migrations as completed.

### Validation status and gates

- Static checks: `bun run typecheck` (0 errors), `bun run lint` (0 errors), `bun test src/` (all tests passed).
- Device & runtime gates: Documentation and dead-code deletion only; no physical Android or iOS device attached. Full iOS Xcode build and physical iPhone/iPad gates remain OPEN in `docs/KNOWN_TRADEOFFS.md`.

## Unreleased - 2026.08.15 (3) [Native Universal Switch Architecture and Visual Integration]

### Native-backed Switch with explicit semantic color integration in Expo SDK 57

- Migrated the reusable AETHER `ToggleSwitch` primitive to a native-first platform adapter
  delegating directly to platform-native toolkits ([`ToggleSwitch.tsx`](src/components/ui/ToggleSwitch.tsx)):
  - **Android**: Backed by `@expo/ui/jetpack-compose` `Switch` configured with explicit
    `SwitchColors` mapped directly to AETHER semantic tokens (`colors.accent`, `colors.onAccent`,
    `Colors.surfaceRaisedDark`/`Light`, `Colors.secondaryTextDark`/`Light`, `Colors.borderDark`/`Light`),
    preventing derived `SchemeTonalSpot` cyan/teal palette drift from `Host` `seedColor`.
  - **Apple (iOS & iPadOS)**: Backed by `@expo/ui/swift-ui` `Toggle` with native `tint(colors.accent)`,
    `labelsHidden()`, and `disabled` modifier integration, preserving native SwiftUI switch
    geometry, animations, Dynamic Type, and VoiceOver accessibility.
  - **Fallback / Web**: Backed by `@expo/ui` Universal `Switch`.
- Removed obsolete custom switch machinery: deleted Reanimated imports (`useSharedValue`,
  `useAnimatedStyle`, `withSpring`, `interpolateColor`, `useReducedMotion`, `ReduceMotion`),
  `useEffect` progress synchronization, custom track/thumb views, custom track/thumb geometry,
  and the outer `AnimatedPressable`.
- Preserved AETHER setting semantics, controlled state model, single-boundary haptics gated
  by `useSettingsStore.getState().hapticsEnabled`, and dynamic Material 3 primary palette
  support when `materialColorsEnabled` is active.
- Added comprehensive unit test suite in [`ToggleSwitch.test.tsx`](src/components/ui/ToggleSwitch.test.tsx)
  covering Android Compose `SwitchColors` mapping, iOS SwiftUI `tint`/`labelsHidden` modifiers,
  fallback platform handling, controlled value binding, `onValueChange` forwarding, disabled switch
  protection, and haptic feedback policy.

### Validation status and gates

- Static checks: `bun run typecheck` (0 errors), `bun run lint` (0 errors), `bun test src/`
  (345 passed, 2 skipped, 0 failed across 70 files).
- Bundle exports: `bunx expo export --platform android` and `bunx expo export --platform ios`
  both succeeded cleanly with Hermes bytecode generation.
- Native build: Android native Gradle Kotlin compilation (`:app:compileDebugKotlin`) succeeded (413 tasks).
- Device & runtime gates: No physical Android or iOS device was attached during this session (`adb devices` empty).
  Static contracts, setting bindings, and theme color mappings are verified, but runtime behavior
  (physical toggle interaction, TalkBack/VoiceOver role and state, rapid multi-toggles, and iPad layout)
  remains OPEN until tested on physical Android and Apple runtimes. Full iOS Xcode build and
  physical iPhone/iPad gates remain OPEN in `docs/KNOWN_TRADEOFFS.md`.

## Unreleased - 2026.08.15 (2) [Native Universal Picker Architecture]

### Native-backed Universal Picker in Expo SDK 57

- Migrated the reusable AETHER `Picker` primitive from a custom/fake-native single-selection
  implementation to the Expo SDK 57 Universal Picker (`@expo/ui` `Picker` & `Host`).
  [`Picker.tsx`](src/components/ui/Picker.tsx)
- **Android**: Backed by Jetpack Compose Material 3 `ExposedDropdownMenuBox` with
  platform-native dropdown menu presentation, outside and back-press dismissal, and
  accessibility semantics.
- **Apple (iOS & iPadOS)**: Backed by native SwiftUI `Picker` with `.pickerStyle(.menu)`
  within a sizing `Host`, providing native compact menu presentation, VoiceOver semantics,
  and keyboard/pointer support.
- Removed obsolete fake-native machinery from `Picker.tsx`: deleted `open` React state,
  custom trigger button, custom chevron icon, custom inline menu container, per-option
  `AnimatedPressable` rows, manual radio/combobox accessibility states, and hand-built
  iOS segmented control branch.
- Preserved AETHER field semantics and typed API: strongly-typed generics across callers
  (`RecurrenceFrequency`, `RecurrenceMode`, `'never' | 'date' | 'count'`, `TaskPriority`),
  field label, helper text, error text with alert live region, disabled field handling,
  and selection change haptics via `src/lib/haptics.ts`.
- Added unit tests in [`Picker.test.tsx`](src/components/ui/Picker.test.tsx) covering
  typed value bridge, option item delegation, haptic firing policy, disabled handling,
  unknown value safety, and error/helper text rendering.

### Validation status and gates

- Static checks: `bun run typecheck` (0 errors), `bun run lint` (0 errors), `bun test`
  (336 passed, 2 skipped, 0 failed).
- Bundle exports: `bunx expo export --platform android` and `bunx expo export --platform ios`
  both succeeded with Hermes bundling.
- Native build: Android native Gradle Kotlin compilation (`:app:compileDebugKotlin`) succeeded.
- Device & runtime gates: No physical Android or iOS device was attached during this session (`adb devices` empty).
  `TaskEditorSheet` static contract and field bindings are verified, but runtime behavior
  (popup menu presentation, focus, TalkBack/VoiceOver, rapid selection, and dismissal)
  remains OPEN until tested on physical Android and Apple runtimes. Full iOS Xcode build and
  physical iPhone/iPad gates remain OPEN in `docs/KNOWN_TRADEOFFS.md`.

## Unreleased - 2026.08.15 (1) [Native Sheet Presentation Architecture]

### Native-first sheet presentation in Expo SDK 57

- Replaced the custom JavaScript/Reanimated/Gesture Handler physics layer in
  `Sheet.tsx` with native-first sheet presentation via `@expo/ui/community/bottom-sheet`.
  [`Sheet.tsx`](src/components/ui/Sheet.tsx)
- **Android**: Backed by Jetpack Compose Material 3 native `ModalBottomSheet` via
  `Host` and `RNHostView`. Compose owns M3 sheet spring/dismiss physics,
  back-press dismissal, and IME layout coordination.
- **Apple (iOS & iPadOS)**: Backed by native SwiftUI `.sheet()` presentation via
  `Host`, `Group`, and `RNHostView`. Supports SwiftUI presentation detents, native
  drag indicators, interactive dismissal, and iPad fitted presentation sizing.
- Removed obsolete sheet-only machinery from `Sheet.tsx`: deleted `project()`,
  `rubberband()`, `SPRING_CONFIG`, manual `translateY` shared value, manual `opacity`
  shared value, `Gesture.Pan`, and custom modal backdrop blur overlay.
- Preserved AETHER visual identity: surface tokens (`Colors.surfaceDark`,
  `Colors.surfaceLight`), typography tokens (`Typography`), header actions, and footer.
- Added comprehensive unit tests in [`Sheet.test.tsx`](src/components/ui/Sheet.test.tsx)
  covering open/close state mapping, dismiss callbacks, locked sheet handling,
  header actions, footers, and custom snap points.

### Validation status and gates

- Static checks: `bun run typecheck` (0 errors), `bun run lint` (0 errors), `bun test`
  (330 passed, 2 skipped, 0 failed).
- Bundle exports: `bunx expo export --platform android` and `bunx expo export --platform ios`
  both succeeded with Hermes bundling.
- Native build: Android native Gradle Kotlin compilation (`:app:compileDebugKotlin`) succeeded.
- Device & runtime gates: No physical Android or iOS device was attached during this session (`adb devices` empty).
  `TaskEditorSheet` static contract and code-path compatibility are verified, but runtime behavior
  (IME/keyboard, focus, scrolling, native drag dismissal, Android Back, rapid reopen, and navigation)
  remains OPEN until tested on an Android runtime. Full iOS Xcode build and physical iPhone/iPad gates
  remain OPEN in `docs/KNOWN_TRADEOFFS.md`.

## Unreleased - 2026.08.14 (2) [Adaptive Motion Telemetry Correctness]

### Android aggregator is thread-safe and atomically snapshotted

- `FrameAggregator` no longer assumes `JankStats` and the 750 ms emit timer
  share a thread. Mutable window state is guarded by a small lock.
  [`FrameAggregator.kt`](modules/aether-motion/android/src/main/java/expo/modules/aethermotion/FrameAggregator.kt)
- `snapshotAndReset()` copies the bounded overrun buffer under the lock,
  resets in the same critical section, and sorts outside the lock. A frame
  belongs to one window. The per-frame `record()` path stays O(1) and does
  not allocate.
- JVM tests now include concurrent record + snapshot/reset accounting,
  repeated reset validity, bounded overrun storage, and percentile integrity
  in [`FrameAggregatorTest.kt`](modules/aether-motion/android/src/test/java/expo/modules/aethermotion/FrameAggregatorTest.kt).

### iOS cadence is not JankStats and not panel maximum

- `currentRefreshRateHz` is the recent scheduled cadence from
  `targetTimestamp - timestamp`, median-smoothed over five samples. It is
  not `UIScreen.maximumFramesPerSecond` and not `1 / CADisplayLink.duration`.
- `jankRatio` and `frameOverrunP95Ms` are `null` on iOS. Legitimate
  ProMotion 120/80/60 Hz changes are not classified as jank.
  [`AetherMotionModule.swift`](modules/aether-motion/ios/AetherMotionModule.swift),
  [`CadenceTelemetry.swift`](modules/aether-motion/ios/CadenceTelemetry.swift)
- Optional iOS diagnostics `cadenceIntervalMs` and `callbackDelayP95Ms` are
  typed, optional, and ignored by older jank policy.

### Memory pressure is temporary

- An iOS memory warning now sets a timed `memoryPressureActive` ceiling for
  `MOTION_MEMORY_PRESSURE_COOLDOWN_MS` (180 s). It is no longer a forever
  `lowMemory` latch. Recovery uses the existing slower hysteresis, not an
  instant `reduced → full` jump.
  [`MemoryPressurePolicy.swift`](modules/aether-motion/ios/MemoryPressurePolicy.swift)

### Native capability reads and parser safety

- `MotionProvider` reads native capabilities once at initialization.
- Snapshot parsing accepts `jankRatio = null`, unusual valid cadences, and
  rejects zero/negative/`NaN`/infinite refresh rates without crashing
  startup. [`snapshot.ts`](src/motion/core/snapshot.ts)

### Share Extension compile nit and lint

- Removed a non-optional `if let` unwrap on `Data` in
  [`ShareViewController.swift`](targets/aether-share-extension/ShareViewController.swift).
  Capture semantics are unchanged.
- Removed the unused `AlertTriangle` import in `TaskUndoBanner.tsx`.

### Remaining device gates

- Scheme `AetherShareExtension` now compiles for the iOS simulator. Full
  scheme `AETHERReminder` and isolated `AetherMotion` still fail in Expo's
  `ExpoModulesJSI` (`JavaScriptCodable+Date.swift:53`). Swift XCTest is
  not wired. Physical FPS, jank, thermal, Power Saver, Reduce Motion, and
  ProMotion behavior remain OPEN. No `adb` command was used. See
  [`docs/ADAPTIVE_MOTION.md`](docs/ADAPTIVE_MOTION.md) and
  [`docs/KNOWN_TRADEOFFS.md`](docs/KNOWN_TRADEOFFS.md).

## Unreleased - 2026.08.14 (1) [Adaptive Native Motion Engine]

### Runtime-adaptive motion language

- Added a formal motion subsystem in [`src/motion/`](src/motion/) with four
  semantic tiers (`full`, `standard`, `reduced`, `minimal`). The same AETHER
  identity is kept; only fidelity and cost change.
- The governor is a pure reducer. Static ceiling, accessibility, power,
  thermal, and aggregated frame health combine with hysteresis. There is no
  device, manufacturer, SoC, or GPU whitelist.
- Native telemetry lives in [`modules/aether-motion`](modules/aether-motion).
  Frame callbacks only increment bounded counters. Snapshots emit every 750 ms.
  Missing or malformed native data fails safe to a conservative `standard`
  profile.

### Platform signals and surfaces

- Android reads `JankStats`, display refresh rate, Power Saver, API 29+
  thermal status, low-RAM, and snapshot-time `lowMemory`. API level can disable
  blur; it does not pick the motion tier.
- iOS/iPadOS reads one `CADisplayLink`, `ProcessInfo` thermal/Low Power, and
  memory warnings. `CADisableMinimumFrameDurationOnPhone` is declared through
  the module plugin so the OS may use supported ProMotion rates. 120 Hz is not
  claimed.
- [`AdaptiveBlur`](src/motion/components/AdaptiveBlur.tsx) and
  [`AdaptiveGlass`](src/motion/components/AdaptiveGlass.tsx) own live blur and
  iOS 26+ `expo-glass-effect` availability checks. `GlassSurface`, press,
  task completion, sheets, Today enter motion, and the voice/Orb-equivalent
  controls consume the shared presets.

### Tests and remaining device gates

- Pure policy, snapshot validation, preset, blur/glass, accessibility, and
  architecture-guard tests run under Bun. Kotlin JVM tests cover thermal
  mapping and bounded aggregation. Swift XCTest sources exist but are not
  claimed as executed.
- Physical FPS, jank, thermal, Power Saver, Reduce Motion, and ProMotion
  behavior remain OPEN in [`docs/KNOWN_TRADEOFFS.md`](docs/KNOWN_TRADEOFFS.md).
  See [`docs/ADAPTIVE_MOTION.md`](docs/ADAPTIVE_MOTION.md).

## Unreleased - 2026.08.13 (2) [Transcription WebSocket Bootstrap]

### Dedicated transcription session no longer uses a conversational model query

- Stopped opening `wss://api.openai.com/v1/realtime?model=gpt-live-transcribe`.
  That query is the conversational Realtime session selector. Official
  documentation places `gpt-live-transcribe` only at
  `session.audio.input.transcription.model` for `session.type = "transcription"`.
  The dedicated bootstrap is now `?intent=transcription`.
- The previous physical Android `invalid_model` rejection
  (`Model "gpt-live-transcribe" is not supported in transcription mode`)
  happened after `websocket_open` during `session.update`, before any audio
  append. Capture, PCM, client-secret minting, and WebSocket auth were already
  healthy.
- Kept `gpt-live-transcribe` as the only transcription model. Live deltas are
  accepted while the session is ready. Pre-connect PCM is flushed in order
  before live packets that arrive during the handoff.

### Protocol regression and live provider staging

- Added a regression that fails if the production URL contains `?model=` or
  treats `gpt-live-transcribe` as a top-level Realtime model.
- The gated live test now skips only when `OPENAI_API_KEY` is absent and
  reports `CLIENT_SECRET` / `WEBSOCKET` / `SESSION_CONFIGURATION` /
  `AUDIO_APPEND` / `COMMIT` / `TRANSCRIPTION` on failure. It uses the minimum
  transcription payload first: PCM 24000, `gpt-live-transcribe`,
  `turn_detection: null`.

## Unreleased - 2026.08.13 (1) [Realtime WebSocket Transcription]

### Native PCM transport rebuilt around the current OpenAI protocol

- Replaced the invalid WebRTC/DataChannel transcription path with the single
  `OpenAIRealtimeWebSocketTransport` path. The prior SDP offer had no audio
  media section while manually captured PCM was sent through a DataChannel, so
  OpenAI correctly rejected it as `invalid_offer`.
- Preserved Expo/native PCM capture and `Pcm16StreamNormalizer` ownership:
  mono, little-endian PCM16 at 24 kHz now enters bounded WebSocket append
  packets and explicit manual commit for `gpt-live-transcribe`.
- Kept the BYOK standard key limited to the HTTPS
  `/v1/realtime/client_secrets` request. The transport receives only the
  short-lived secret and sends it through the documented WebSocket
  subprotocol.
- Added explicit WebSocket lifecycle states, configuration/connection/final
  transcript timeouts, bounded pre-connect and send buffering, typed
  backpressure/protocol failures, deterministic cancellation, stale-socket
  rejection, and safe counter-only diagnostics.

### Protocol-contract coverage and validation boundaries

- Replaced arbitrary SDP mocks with WebSocket contract tests that assert the
  exact session payload, current event names, Base64 bytes, packet ordering,
  commit lifecycle, delta/completion authority, provider failures, malformed
  events, cancellation, timeouts, backpressure, cleanup, and diagnostics
  privacy.
- Added a gated live test that requests the same client secret as the app,
  opens the real Realtime WebSocket, sends deterministic PCM, commits, and
  waits for a real completion or provider response. It is skipped unless
  `RUN_AETHER_VOICE_INTEGRATION=1` and `OPENAI_API_KEY` are explicitly set.
- Updated [`docs/voice-subsystem.md`](docs/voice-subsystem.md), architecture
  notes, and the manual validation checklist. Unit/static validation does not
  claim live OpenAI or physical Android/iOS/iPadOS evidence.

## Unreleased - 2026.08.12 (2) [Universal Capture Closure and GA Validation Gates]

### Persistent native and GA validation debt

- Added seven evidence-based Universal Capture gates to
  [`docs/KNOWN_TRADEOFFS.md`](docs/KNOWN_TRADEOFFS.md): full iOS/Xcode build and
  signing, physical iPhone, physical iPadOS, physical Android OEMs, Android
  16/API 36 behavior, iOS App Group asset authority, and Android production
  delivery size. Every gate records status, current evidence, risk, closure
  evidence, and when related future work can address it.
- Preserved the readiness split: Android is `READY FOR DEVICE VALIDATION` from
  the previously completed local native compilation; iOS/iPadOS is
  `READY FOR NATIVE BUILD VALIDATION`; global Phase 5 remains
  `READY FOR NATIVE BUILD VALIDATION`. No physical-device, Xcode signing,
  provisioning, Siri/Spotlight, store, or release-delivery evidence was inferred.

### Narrow ingress hardening

- Declared `AetherShareExtension` in Expo's experimental EAS iOS app-extension
  configuration with its stable bundle identifier and App Group entitlement.
  This supports target credential discovery without treating generated config as
  Xcode compilation or signing evidence.
- Changed committed iOS image ownership from the shared App Group to host-private
  Application Support. Adoption creates the private copy before removing shared
  temporary state, remains replay-safe across interruption, and leaves the
  authoritative task database outside the extension container.
- Added a bounded legacy asset-authority migrator and repository query. Existing
  App Group committed source references are replaced only after host-private
  adoption succeeds; failures remain retryable. Added regression coverage for
  adoption failure and replay after interruption before database acknowledgement,
  plus rejection of traversal-like capture IDs.
- Updated Universal Capture documentation to distinguish App Group pending ingress
  from host-private committed task sources and to point validation status to the
  durable tradeoff register.

### Agent continuity

- Added an `AGENTS.md` checkpoint requiring relevant future work to inspect and
  update unresolved tradeoffs when real evidence becomes available. The rule
  surfaces gates contextually at native validation, beta, release, signing, or
  store-preparation points without nagging unrelated work or treating Android-first
  distribution as Android-only architecture.

### Validation performed and limits

- Before native execution was stopped, 12 focused Universal Capture tests passed,
  strict TypeScript checking passed, lint exited successfully with one style
  warning that was then corrected, Expo configuration introspection passed, an
  isolated clean prebuild generated both platform projects, and Swift syntax
  parsing passed. Generated
  configuration was inspected for the Share Extension target and embedding,
  matching App Group entitlements, App Intent sources, Android share filters,
  Quick Settings service, launcher shortcut, API 36 targeting, Predictive Back,
  and absence of permanent orientation/resizability opt-outs.
- A subsequent Android debug Gradle build was explicitly terminated at the user's
  direction with exit code 130 before completion. It is not recorded as build
  evidence. No release AAB or bundletool delivery-size estimate was produced.
- No full Xcode compile/link/embed/sign/archive, Apple provisioning, EAS build,
  physical Android/iPhone/iPadOS run, Siri/Spotlight discovery, Play Console
  inspection, deployment, publishing, or store submission was performed.
  At the user's direction, no compiler, build, prebuild, test, typecheck, lint, or
  Expo command was rerun after the final documentation edits; `git diff --check`
  passed.

## Unreleased - 2026.08.12 (1) [NOW/NEXT Attention Engine v1]

### Smaller Home decision surface

- Added the local-first `AttentionPlan` read model and pure deterministic
  `AttentionPlanner` for Home. NOW contains at most one recommendation, NEXT
  is capped at four bounded candidates, and ambiguous evidence returns a small
  `choose` state instead of an arbitrary recommendation.
- Added versioned rank tiers for explicit focus, imminent timed work, active
  Adaptive Nudge opportunities, scheduled-today work, and near-future work.
  Temporal urgency remains distinct from static priority, and undated work is
  not selected without an explicit signal.
- Added structured reason codes, high/medium/low confidence, factual “Why now?”
  explanations, deterministic tie-breaking, and 15-minute focus hysteresis.
  The planner remains free of React, Expo, SQLite, native notification, network,
  and LLM dependencies.

### Bounded local candidate and integration path

- Added `TasksRepository.listAttentionCandidates()` with a bounded local date
  window, explicit-focus inclusion, active Adaptive Nudge inclusion, stable
  ordering, and a 32-item limit. Existing task due-date and adaptive-nudge
  indexes were reused; no SQLite migration or new index was required.
- Added `AttentionService` and registered it in `DomainServices`. It gathers
  normalized temporal facts, Recovery state, semantic nudge signals, and the
  lightweight reliability state before invoking the pure planner.
- Added `NudgeService.getAttentionSignals()` and an active adaptive-nudge
  repository query that expose only derived `nudge_due` semantics; raw nudge
  history, profile calculations, budgets, and timing policy remain owned by
  Adaptive Nudge.
- Added lightweight active-reminder reliability checks for degraded projection,
  permission, channel, and recorded delivery-error state. Reliability alerts
  remain separate from task ranking.

### Explicit focus, recovery, recurrence, and execution flow

- Added command/store support for `Focus now`, clear focus, and session-level
  `Not now` suppression. Focus is stored as minimal local intent in `app_meta`
  and never changes task priority, due date/time, recurrence, or reminders.
- Preserved explicit focus during imminent conflicts and added a user-controlled
  “Switch focus?” alert. Smart Recovery-owned overdue tasks produce one Recovery
  intervention instead of flooding NOW/NEXT.
- Kept completion, notification projection, Recovery Apply, recurrence
  advancement, and Adaptive Nudge replanning on their existing ownership paths.
  Recurrence successors are independently evaluated and never inherit focus.
- Added time-boundary refresh scheduling from the next meaningful planner
  boundary without high-frequency polling or background-worker requirements.

### Responsive Home presentation

- Integrated NOW/NEXT into the existing Home/Today route through the new
  `AttentionSurface`; the remaining Today list stays secondary rather than
  duplicating surfaced tasks.
- Added compact vertical phone presentation and bounded width-based NOW/NEXT
  columns for iPad and large windows. Android uses route-local elevated
  surfaces without recursive blur targeting; iOS and iPadOS share the same
  decision logic and adapt through window size rather than platform checks.
- Added accessible labels, factual explanations, touch-sized actions, clear/
  choose/recommended states, Recovery and reliability alerts, and reduced-motion
  compatible presentation.

### Documentation, tests, and validation limits

- Added the [NOW/NEXT architecture documentation](docs/NOW_NEXT_ATTENTION_ENGINE.md)
  and [manual Android, iPhone, and iPadOS validation checklist](docs/VALIDATION_NOW_NEXT.md).
- Added deterministic planner coverage for ranking, urgency versus priority,
  date-only and undated work, confidence, focus persistence and conflict,
  Recovery, Adaptive Nudge, reliability alerts, hysteresis, recurrence safety,
  determinism, and bounded NEXT. Added service coverage proving focus does not
  mutate schedules and repository coverage with 500 local tasks proving the
  candidate result remains capped at 32.
- `bun test`: 227 passed, 2 existing manual/provider tests skipped, 0 failed
  across 229 tests in 51 files. `bun run typecheck`, `bun run lint`,
  `bunx expo config --type public`, and `git diff --check` passed.
- No Android phone, iPhone, or iPadOS physical-device validation was performed;
  the feature remains `READY FOR DEVICE VALIDATION`. No deployment, publishing,
  submission, or production credentials were added.

## Unreleased - 2026.08.11 (2) [Adaptive Nudge Engine v1]

### First-class local nudge intents

- Added explicit `adaptive_followup` reminder intents with task ownership,
  generation source, policy version, reason, idempotency key, and
  cancellation/consumption state. Adaptive nudges remain derived opportunities
  to surface unfinished work; they never modify the task due date, due time,
  recurrence cadence, or deadline and never duplicate the primary reminder.
- Added append-only migration `0008_adaptive_nudges` with indexed reminder
  metadata, local `nudge_events`, and the aggregated `nudge_profiles` row.
  SQLite remains authoritative, while native notifications remain disposable
  projections through the existing reliability layer.
- Added a seven-day bounded planning horizon and indexed candidate reads so
  replanning remains local, bounded, and independent of network, LLM, or
  periodic background execution.

### Explainable local behavioral learning

- Added compact local `NudgeEvent` signals for completion timing, notification
  opens, Complete/Snooze/Tomorrow actions, Smart Recovery decisions, manual
  reschedules, and adaptive-nudge actions. Notification silence or dismissal is
  intentionally not treated as proof of user attention, and task content is not
  stored in behavioral tables.
- Added deterministic `NudgeProfile` aggregation with weekday/time buckets,
  completion and deferral counts, bounded EWMA Snooze-delay learning, timing
  deltas, and neutral explainability reasons. Confidence is `insufficient` below
  five samples, `emerging` at five through nine, and `confident` at ten or more;
  preferred time windows require confident evidence, while learned Snooze delay
  requires five explicit Snooze samples and remains clamped to sane bounds.
- Added visible, conservative opt-in `Adaptive Nudges` settings with the
  explanation “AETHER can learn from completion and snooze patterns to choose
  better follow-up times.” Added a local reset action that clears learned
  events/aggregates without deleting tasks, recurrence rules, or ordinary
  reminders.

### Pure planning and anti-annoyance policy

- Added the platform-independent `NudgePlanner` and `NudgeService`. The planner
  checks completion/deletion, schedule validity, temporal semantics, existing
  nudges, explicit deferral state, learned timing, and Smart Recovery state
  before returning no nudge, one proposal, or normal `suppressed_by_budget`.
- Added conservative defaults: one adaptive nudge per task per scheduled day,
  three globally per day, a 120-minute adaptive cooldown, no immediate
  follow-up after Snooze/Tomorrow, no duplicate pending policy slot, and
  cancellation on completion. Same-day candidates are priority ordered so
  overdue work cannot create a notification storm.
- Added date-only flexible evening opportunities without inventing a task due
  time; fixed and floating temporal semantics remain distinct. Explicit action
  handling is idempotent, safe across cold launch, and records effective Snooze
  durations while preserving Tomorrow as a distinct deferral.

### Recovery and recurrence boundaries

- Integrated Adaptive Nudge with Smart Recovery’s shared 30-minute handoff:
  recent misses may receive one bounded follow-up, while meaningfully overdue
  work is delegated to Recovery instead of being nudged repeatedly. Applying a
  Recovery plan invalidates stale adaptive intents and regenerates the current
  plan without counting the recovery mutation as notification success.
- Added lifecycle replanning on authoritative task/reminder mutations, task
  completion/reopen, notification actions, Recovery apply, cold start,
  foreground transition, timezone change, and settings changes. Native
  projection failures preserve desired SQLite nudge state for repair.
- Kept adaptive intents tied to the current recurring occurrence. Recurrence
  advancement filters engine-generated nudges so stale adaptive reminders are
  never copied as user-defined offsets into the next occurrence.

### Cross-platform presentation and validation

- Added shared semantic presentation policies (`gentle`, `standard`, and
  `attention_required`). Adaptive follow-ups use a gentle policy; Android maps
  them to the stable low-importance `aether-adaptive-reminders` channel, while
  primary reminders retain `aether-reminders`. iOS and iPadOS map the same
  policy through supported passive/active presentation behavior without
  Critical Alerts or automatic Time Sensitive escalation.
- Added the [Adaptive Nudge Engine architecture documentation](docs/ADAPTIVE_NUDGE_ENGINE.md)
  and [physical-device validation checklist](docs/VALIDATION_ADAPTIVE_NUDGES.md).
- `bun test`: 210 passed, 2 intentional manual/provider tests skipped, 0
  failed across 212 tests in 49 files. `bun run typecheck`, `bun run lint`,
  `git diff --check`, Expo public configuration validation, and Android+iOS
  Expo exports all passed.
- Real-device validation was reported by the user as completed on a physical
  device. The device model, OS build, app build, platform, and exact scenarios
  were not supplied, so this entry records user-reported validation only and
  makes no Android OEM, iPhone, or iPadOS matrix claim.
- The required Android development EAS build was attempted and uploaded but
  was rejected because the configured Expo account had exhausted its monthly
  free-plan Android build quota. No deployment, publishing, submission, or
  production credentials were added.

## Unreleased - 2026.08.11 (1) [Smart Recovery v1]

### Deterministic local recovery planning

- Added a derived `RecoveryService` and `RecoveryPlan` that detect active,
  incomplete, non-deleted overdue work and timed tasks missed beyond the named
  30-minute grace period. Date-only tasks due today remain eligible only after
  the local day ends, and fixed/floating temporal semantics use their effective
  calendars without depending on notification delivery or an LLM.
- Added predictable recommendations: recover date-only tasks to today, retain a
  timed task's original time when it remains sufficiently available, otherwise
  use tomorrow, and expose deterministic Later today, Tomorrow, Keep current,
  and exclusion alternatives. Candidate ordering is deterministic and priority
  aware, while malformed schedules fail closed.
- Kept plans ephemeral and versioned by the authoritative task `updatedAt`
  snapshot. Plans are regenerated from SQLite on Home focus, foreground repair,
  relevant task mutations, and explicit Recovery opening.

### Atomic Apply Recovery and reversible task changes

- Added command/domain/repository support for one-tap `Apply Recovery`. Valid
  schedule selections and `rescheduled` task events commit in one SQLite
  transaction; stale, completed, deleted, or already-applied entries are
  classified without overwriting newer user changes.
- Added batch-level `BULK_MUTATION` receipts with version-protected Undo for
  every successfully recovered task. Reapplying the same plan is idempotent and
  does not create duplicate task events, reminders, or recurrence advancement.
- Added repository rollback coverage proving that an event failure restores the
  entire recovery batch. Native notification or reliability bookkeeping
  failures are reported as projection failures after the domain mutation has
  succeeded.

### Recurrence-safe notification repair

- Corrected fixed recurrence advancement to derive future occurrences from the
  immutable recurrence anchor, so recovering the current occurrence cannot
  shift the series cadence. Existing `after_completion` behavior remains
  completion-based and recurrence rules are not rewritten by Recovery.
- Routed recovered primary reminder updates through the existing reminder and
  Production Reliability boundaries with incremental projection repair; Smart
  Recovery does not schedule OS notifications directly.

### Responsive cross-platform Recovery review

- Added a compact Home recovery summary and an adaptive review sheet showing
  affected tasks, previous/proposed schedules, reasons, per-task alternatives,
  exclusion, Apply Recovery, and the existing Undo affordance.
- Used window dimensions rather than phone-platform assumptions. Compact windows
  use the existing mobile sheet presentation; large windows use a bounded panel
  suitable for iPad portrait, landscape, Split View, and Stage Manager resizing.
- Enabled `ios.supportsTablet` without forcing fullscreen or introducing
  tablet-only behavior. Android and iOS continue to share the domain, command,
  data, and reliability architecture behind their existing native UI adapters.

### Documentation, tests, and validation limits

- Added [Smart Recovery architecture documentation](docs/SMART_RECOVERY.md)
  and the [manual Android, iPhone, and iPadOS validation checklist](docs/SMART_RECOVERY_VALIDATION.md).
- Added deterministic coverage for candidate rules, grace periods, local
  midnight, timezone changes, fixed/floating semantics, malformed schedules,
  priority ordering, stale and duplicate Apply, partial stale batches, batch
  Undo, projection failure, app-restart regeneration, and both recurrence modes.
- `bun test`: 189 passed, 2 intentional manual/provider tests skipped, 0
  failed. `bun run typecheck`, `bun run lint`, `bunx expo config --type public`,
  and Android+iOS Expo export all passed.
- The required Android development EAS build was attempted and uploaded but
  was rejected because the configured Expo account had exhausted its monthly
  free-plan Android build quota. No physical Android, iPhone, or iPadOS
  validation was performed; no deployment, publishing, submission, or
  production credentials were added.

## Unreleased - 2026.08.09 (5) [Voice Failure Forensics and Error Surface Ownership]

### Actionable realtime transcription failures

- Added an abortable OpenAI realtime access preflight to the production voice path
  before the native WebSocket connection. Android handshake failures now retain
  credential, billing, model-access, rate-limit, timeout, provider, and HTTP status
  classifications instead of collapsing every rejection into a generic network
  error.
- Preserved the existing OpenAI realtime architecture and
  `gpt-realtime-whisper` session contract: 24 kHz mono PCM16 capture, normalized
  native audio, bounded packet transport, explicit commit, and exactly-once final
  transcript delivery. OpenRouter remains isolated to the downstream reminder
  interpretation and tool-execution stage.
- Connected provider `Retry-After` metadata to bounded retry behavior, added
  sanitized status/code/request-ID diagnostics, and kept raw provider payloads out
  of user-visible messages.

### Explicit voice and assistant lifecycle states

- Made every capture, transport, and handoff failure transition to an explicit
  voice error state with cleanup of the abort controller, recorder, socket, timers,
  queued audio, and final-delivery guards. Cancellation now also aborts an in-flight
  provider preflight so it cannot retry or start a late recording session.
- Removed contradictory `Ready` presentation during voice failure. The active
  surface now reports `Transcription unavailable`, `Microphone unavailable`, or
  `Reminder processing unavailable` with a concise safe reason.
- Corrected early OpenRouter credential-loading and missing-key failures to move
  the assistant semantic state to `error` rather than retaining an idle/ready state.

### Unoccluded recovery controls

- Made the persistent bottom navigation intentionally absent while the assistant is
  active, eliminating the proven overlap between its `zIndex: 100` host and the
  assistant sheet's `zIndex: 20` surface without introducing z-index escalation.
- Kept voice errors inside the active assistant surface with reachable `Retry`,
  conditional `Settings`, and `Dismiss` actions. Settings is exposed only for
  microphone permission or genuine provider configuration/access failures, and the
  assistant is closed and cleaned up before navigation.
- Hid competing composer controls while voice capture or a voice error owns the
  assistant surface. No reminder-row, typography, navigation appearance, spacing,
  toast, blur-target, GlassSurface, or native-view hierarchy redesign was made.

### Regression coverage and runtime limits

- Added coverage for invalid credentials with preserved HTTP 401 status, provider
  503 retry and final-status handling, cancellation during access validation,
  transient network recovery, realtime session cancellation, PCM packet transport,
  timeouts, safe error copy, and provider-to-transcription error mapping.
- `bun run typecheck`, `bun run lint`, and `git diff --check`: passed. `bun test`:
  144 passed, 1 intentional live OpenRouter smoke test skipped, 0 failed.
- `bun x expo install --check` reported aligned dependencies, Expo Doctor passed
  20/20 checks, and the final Android Hermes export passed with 3,673 modules.
- No Android device, emulator, `adb`, or connected Metro inspector was available.
  The saved-device provider response, real microphone lifecycle, live successful
  transcription, repeated navigation, and Android-back recovery therefore remain
  unconfirmed on hardware; no live voice-success claim is made.

## Unreleased - 2026.08.09 (4) [Safe Database Startup and Recovery]

### Startup readiness boundary

- Removed the synchronous task-store readiness exception that could emit
  `Database not ready` while Expo Router mounted the focused route during normal
  database bootstrap.
- Task reads and mutations now join the idempotent database initialization promise,
  and the AETHER core is rebuilt when recovery replaces its database handle.

### Guarded recovery modes

- Added data-preserving retry, read-only SQLite `quick_check`, and destructive
  recreation modes. Recovery operations are serialized, failed initialization
  handles are closed, and destructive recreation requires an exact confirmation
  token before deleting only `aether.db` and rerunning migrations.
- Added boot-error controls for safe retry and integrity checking, plus a separate
  destructive confirmation dialog that states reminders and local history will be
  removed while SecureStore provider credentials remain untouched.
- Added focused tests for retry preservation, integrity pass/failure behavior,
  destructive confirmation, and overlapping recovery rejection.

### Validation and remaining device scope

- `bun test`: 140 passed, 1 intentional OpenRouter smoke test skipped, 0 failed.
- `bun run typecheck` and `git diff --check`: passed. `bun run lint` completed
  with one unrelated unused-variable warning in an existing uncommitted
  `AppBottomNavigation` edit.
- Android Hermes export passed with 3,673 modules.
- No Android device, emulator, or `adb` was available, so database recreation and
  the recovery dialog remain statically verified rather than real-device confirmed.

## Unreleased - 2026.08.09 (3) [Android Runtime Crash Safety and Overlay Ownership]

### Native blur hierarchy correction

- Removed implicit global blur-target propagation from `GlassSurface`; Android
  route-local glass now uses the existing translucent Tier C material unless it is
  given an explicit, structurally safe target.
- Restricted Android live blur to bounded floating chrome outside its capture
  target. `AppBottomNavigation` now receives the route target explicitly as a
  sibling, while composers, quick-action menus, route content, and other descendants
  cannot recursively capture an ancestor containing themselves.
- Traced the Schedule, Reminders, repeated-tab, and composer `+` failures to the
  recursive native hierarchy introduced when the tab tree became a shared
  `BlurTargetView` and all descendant `GlassSurface` instances inherited it. Expo 57
  bundles Dimezis BlurView 3.1, whose target contract explicitly forbids that
  hierarchy.

### Focus, assistant, and Android back ownership

- Scoped assistant context publication to the focused Expo Router tab so inactive
  mounted tabs cannot overwrite the assistant's route snapshot during navigation or
  task-store refreshes.
- Added visible-state Android back handling for the quick-action menu and assistant,
  including voice cancellation through the existing assistant close path, while
  preserving native modal and router/system behavior.
- Confirmed the custom bottom navigation still uses one Expo Router `Tabs`
  navigator, registered routes, `router.navigate`, and pathname-derived selection;
  no duplicate router or independent tab state was introduced.

### Preventive repository rules

- Added Android native-view safety rules to `AGENTS.md` covering forbidden recursive
  blur targets, explicit sibling ownership, Tier C fallback, focused-route global
  state, scoped back handlers, logcat collection, and the real-device interaction
  matrix required before claiming runtime validation.
- Audited the redesign range for unintended persistence, recurrence, notification,
  provider, transcription, and settings-storage changes; this correction does not
  modify those business paths or add native dependencies, permissions, plugins, or
  configuration.

### Validation and remaining device scope

- `bun run typecheck`, `bun run lint`, and `git diff --check`: passed.
- `bun test`: 135 passed, 1 intentional OpenRouter smoke test skipped, 0 failed.
- `bun x expo install --check`: dependencies aligned; `bun x expo-doctor@latest`:
  20/20 checks passed.
- Android Hermes export passed with 3,672 modules. Native Gradle assembly could not
  start because the audit environment had no Java runtime.
- No Android device, emulator, or `adb` was available, so the corrected interactions
  remain statically verified and bundle-validated rather than real-device confirmed;
  no post-fix logcat stack or ten-loop interaction run is claimed.

## Unreleased - 2026.08.09 (2) [AETHER Visual and Interaction Architecture Redesign]

### Platform-split architecture and OLED dark canvas

- Redesigned AETHER from first principles around a strict platform split: system-native first on iOS (`NativeTabs`, native navigation/toolbar, native menus, native sheets) and a custom AETHER visual system on Android.
- Enforced pitch black `#000000` canvas in OLED dark mode with zero elevated card walls around ordinary content. Glass material (`GlassSurface`) is restricted exclusively to floating interactive chrome (`AetherBottomNavigation`, `AetherComposer`, `AetherToolbar`, `AetherContextSurface`).
- Implemented capability-driven rendering Tiers (A/B/C) on Android to guarantee visual stability and smooth performance regardless of hardware blur support.

### Product vocabulary and primary navigation

- Updated primary navigation tab labels and screen titles to the approved vocabulary: `Today` (what matters now), `Schedule` (what is coming), `Reminders` (everything saved), and `Settings` (configuration).
- Maintained underlying route paths (`/index.tsx`, `/tasks.tsx`, `/all.tsx`, `/settings.tsx`) to eliminate routing churn while presenting the refined product vocabulary.
- Simplified empty states on `Today`, `Schedule`, and `Reminders` to restrained, single-line text directly on the canvas (`"Your day is clear."`, `"Nothing scheduled ahead."`, `"Your library is empty."`), eliminating marketing copy and unnecessary centered illustration blocks.

### Contextual toolbar, creation, and voice controls

- Created `AetherComposer` floating bar (`[ + ]  New reminder…  [ mic ]`) anchored above the bottom navigation bar without auto-focusing the keyboard on mount.
- Added `AetherQuickActionsMenu` (`Add date`, `Set priority`, `Add location`, `Attach file`) as a vertical contextual menu anchored to `[ + ]`.
- Created `AetherToolbar`, `AetherToolbarGroup`, and `AetherToolbarButton` following Apple HIG toolbar grouping rules, eliminating individual circle backgrounds on grouped controls.
- Created `AetherContextSurface`, `AetherContextMenu`, and `AetherVoiceCapture` components to consume existing AETHER voice and transcription pipelines without rewriting backend behavior.

### Validation

- `bun test`: 135 passed, 1 skipped (OpenRouter smoke test), 0 failed.
- `bun run typecheck` and `bun run lint`: passed cleanly with zero errors or warnings.
- `git diff --check`: passed cleanly.

## Unreleased - 2026.08.09 (1) [AETHER Contextual UI Redesign and Reminder Workflows]

### Four-surface navigation architecture

- Rebuilt the primary information architecture around four focused destinations: Compose for capture, Upcoming for active future reminders, All for the complete reminder library, and Settings for configuration.
- Removed AI and Transcribe from the primary navigation. Their routes remain as compatibility redirects, while assistant and voice capabilities are exposed contextually from the workflows where they are useful.
- Updated assistant navigation and `app.navigate` validation to recognize only the four primary destinations.

### Contextual reminder creation and editing

- Added the reusable `TaskEditorSheet` for both new and existing reminders, with title, notes, priority, date, time, and no-date scheduling controls.
- Connected Compose, Upcoming, and All to the same editor flow, including empty states, toolbar actions, task-detail editing, keyboard avoidance, safe-area handling, and platform-appropriate sheet presentation.
- Preserved explicit task actions: tapping task details opens editing, while completion and deletion remain independent controls and cannot trigger accidental navigation.
- Added due-time and timezone-aware task list metadata so scheduled reminders expose their full timing context.

### Reminder library semantics and recovery

- Corrected Upcoming repository queries to return only non-completed reminders with a future schedule.
- Kept All as the complete non-deleted inventory with search plus active/completed filtering.
- Added store and domain update support for editing existing reminders and field-level restore receipts for reliable undo after edits.
- Added regression coverage for upcoming filtering, editable reminder snapshots, and restore-receipt validation.

### Clearer native-inspired interaction design

- Removed the interactive AETHER orb from the redesigned workflow. AETHER branding is now static, and voice capture is an explicit contextual action rather than a persistent navigation control.
- Refined the iOS-inspired light visual system across the redesigned surfaces, retaining Android-native material/blur fallbacks, rounded surfaces, responsive layouts, and touch-safe controls.
- Reviewed entrance and press motion for short, interruptible transitions, transform-only interaction feedback, and Reduce Motion support across Compose, Settings, and task cards.
- Replaced the legacy add-task modal implementation with a compatibility wrapper around the shared editor to keep the creation and editing behavior consistent.

### Validation

- `bun test`: 125 passed, 1 intentional opt-in OpenRouter smoke test skipped, 0 failed.
- `bun run typecheck` and `bun run lint`: passed cleanly.
- `npx expo export --platform android` and `npx expo export --platform ios`: passed.
- `git diff --check`: passed.

### Implementation references

- [Compose surface](src/app/index.tsx)
- [Upcoming surface](src/app/tasks.tsx)
- [All reminders surface](src/app/all.tsx)
- [Contextual reminder editor](src/components/ui/TaskEditorSheet.tsx)
- [Task interaction model](src/components/ui/TaskCard.tsx)
- [Task UI state](src/stores/tasksUi.store.ts)

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
