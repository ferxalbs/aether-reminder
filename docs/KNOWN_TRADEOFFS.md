# Known Tradeoffs

## Notification reconciliation batch size

`NOTIFICATION_RECONCILIATION_BATCH_SIZE` is set to `8` in
`src/services/notifications/localNotificationProjection.ts:274` and is used by
`NotificationReconciliationService` for full and incremental repair batches.

This value is an initial engineering heuristic. It was not derived from
benchmarks, device profiling, or a measured platform limit, and it remains
intentionally unchanged as a deferred decision.

The implementation bounds the number of reconciliation workers in flight per
batch, but it does not impose a timeout or a total reconciliation-time bound.
Batches run serially until the complete reminder set has been processed.

The concrete risk is that a low-end Android device with a large reminder set
could experience excessive SQLite/notification I/O contention or a slow startup
or foreground-resume. If `8` is too high, the current remedy is to change the
constant and ship a new build; it is not runtime-configurable or adaptive.

The proper resolution is device profiling with a realistic reminder count,
including approximately 200–500 reminders, on a low- and mid-end Android
device before general availability. The result should inform a measured batch
size and whether a total-time safeguard is also required.

## Universal Capture native validation and GA gaps

Phase 5 has different evidence levels by platform. Android is **READY FOR DEVICE
VALIDATION** based on the previously completed local native compilation recorded
by the Phase 5 work. iOS/iPadOS is **READY FOR NATIVE BUILD VALIDATION** because
generation and syntax-level checks do not prove an Xcode build. Global Phase 5 is
therefore **READY FOR NATIVE BUILD VALIDATION**, the least-validated supported
platform level. This section is the durable source of truth for the remaining
gates; previous agent reports are supporting history, not closure evidence.

### Gate 1 — Full iOS/Xcode build and signing

**Status:** PARTIALLY VERIFIED

**Current evidence:** A prior clean Expo prebuild generated the main application,
`AetherShareExtension`, extension embedding configuration, bundle identifiers,
and matching App Group entitlements. The telemetry patch compiled scheme
`AetherShareExtension` for `iphonesimulator` successfully after a one-line
non-optional `Data` unwrap fix in `ShareViewController.swift`. Full scheme
`AETHERReminder` still fails in Expo's `ExpoModulesJSI` xcframework script
(`JavaScriptCodable+Date.swift:53`). The Expo configuration still declares
`AetherShareExtension` under `extra.eas.build.experimental.ios.appExtensions`.
This is required because Expo CNG support for iOS App Extensions is
experimental. There is still no signed archive.

**Risk:** Compilation, linking, embedding, App Intents discovery, signing,
provisioning, and archive behavior may still fail or differ under the actual
Apple toolchain and credentials.

**Closure evidence required:** A real Xcode compile/link of the main application
and Share Extension targets; inspection of extension embedding; verification of
both bundle identifiers and App Group entitlements; valid provisioning profiles
and extension signing; App Intents compilation/discovery; and a successful local
or EAS archive using the intended distribution configuration.

**Can be addressed during unrelated work:** Yes, when work already reaches an
iOS native build, signing, EAS, TestFlight, beta, or release validation point and
the required Xcode toolchain and Apple credentials are available.

### Gate 2 — Physical iPhone validation

**Status:** OPEN

**Current evidence:** No physical-iPhone execution evidence is recorded for
Universal Capture.

**Risk:** Share-provider behavior, extension lifecycle, App Group persistence,
deferred drain, App Intent discovery, Siri/Spotlight exposure, and warm/cold app
transitions cannot be established by source inspection or generated projects.

**Closure evidence required:** On a physical iPhone, validate Share Extension
capture from Safari, Photos, Files where supported, and Notes or another text
source for text, URL, and image; cancellation; offline operation; warm,
backgrounded, and terminated host app; extension termination; duplicate delivery;
App Group persistence; and deferred inbox drain. Validate the App Intent and App
Shortcut through Shortcuts, Siri where supported, and Spotlight for repeated
invocation, app running/terminated, and offline operation. Record device model,
OS version, app build, exact cases, and results.

**Can be addressed during unrelated work:** Yes, at a natural iPhone native QA,
beta, or release checkpoint. Do not interrupt unrelated work solely to request a
device.

### Gate 3 — Physical iPadOS validation

**Status:** OPEN

**Current evidence:** The Share Extension uses an adaptive, bounded-width layout
and the host app declares tablet support, but no physical-iPad execution evidence
is recorded. iPhone evidence would not close this gate.

**Risk:** Extension width adaptation, keyboard/focus behavior, Dynamic Type,
host-app `/capture` state, and state preservation across iPad window changes may
fail despite phone correctness.

**Closure evidence required:** On a physical iPad, validate Share Extension, App
Intent, and App Shortcut in portrait, landscape, Split View, and Stage Manager or
another resizable-window mode where available. Include Dynamic Type, hardware or
software keyboard navigation, extension width adaptation, the host-app `/capture`
route, and state preservation across resizing. Record device, OS, build, cases,
and results.

**Can be addressed during unrelated work:** Yes, when an iPad is naturally
available for native QA, beta, or release validation. Do not infer closure from an
iPhone or simulator alone.

### Gate 4 — Physical Android OEM validation

**Status:** OPEN

**Current evidence:** The Phase 5 baseline records a successful local Android
native compilation, but no physical Pixel, Samsung, or additional-OEM matrix is
recorded.

**Risk:** OEM sharesheets, temporary URI grants, process restoration, locked-device
tile behavior, launcher shortcuts, Android Back, and capture-route replay may vary
by device and OS skin.

**Closure evidence required:** Validate at minimum a Pixel/stock Android device and
a Samsung/One UI device, preferably one additional OEM. Cover text, URL, and
image/screenshot share; cancellation; duplicate intents; dead, warm, and
background processes; Quick Settings tile add/remove and locked-device behavior;
launcher shortcut; offline operation; Android Back; and repeated capture
navigation loops. Collect `adb logcat` around every process exit or native
exception and record devices, OS versions, build, cases, and results.

**Can be addressed during unrelated work:** Yes, at a related Android native QA,
beta, or release checkpoint with physical devices. Emulator, unit, and build-only
evidence do not close it.

### Gate 5 — Android 16 / API 36 behavior

**Status:** PARTIALLY VERIFIED

**Current evidence:** AETHER targets API 36 and retains
`predictiveBackGestureEnabled: true`; generated configuration inspected during the
Phase 5 work did not introduce a permanent edge-to-edge, Predictive Back,
orientation, or resizability opt-out. No API 36 runtime matrix is recorded.

**Risk:** Android 16 removes the effective edge-to-edge opt-out for API 36 apps,
enables Predictive Back by default, and changes orientation/resizability behavior
on displays with smallest width at least 600dp. Insets, IME movement, back
ownership, and large-window layouts can therefore regress only at runtime. API 36
is also required for new Google Play applications and application updates starting
August 31, 2026; lowering the target is not an acceptable workaround.

**Closure evidence required:** On Android 16/API 36, audit status/navigation bars,
bottom navigation, capture review, keyboard/IME, sheets, all system-ingress routes,
and safe-area/inset behavior. Exercise Predictive Back for `/capture`, composer,
modal/sheet dismissal, context menus, Quick Settings, launcher shortcut,
Sharesheet, and route-to-home behavior. Validate tablet and foldable/large-window
behavior in portrait, landscape, split/multi-window, and resizing. Fix actual
issues rather than permanently opting out.

**Can be addressed during unrelated work:** Yes, whenever work touches Android 16,
navigation, insets, large screens, native ingress, beta, or Play preparation and a
representative runtime is available.

### Gate 6 — iOS App Group asset authority

**Status:** PARTIALLY VERIFIED

**Current evidence:** Repository inspection found that committed image sources had
previously remained under App Group `capture-assets/committed`. The implementation
now copies a pending image to host-private Application Support
`AetherCapture/task-sources/<capture-id>`, makes that copy authoritative before
removing shared state, and returns the private reference for transactional source
commit. A bounded foreground migration adopts legacy shared committed assets and
updates their database references only after a private copy exists. Regression
tests cover adoption failure and replay after a simulated crash before reference
acknowledgement. These tests passed during the hardening work before native-build
execution was explicitly stopped; no physical iOS runtime evidence exists.

**Risk:** Real App Group/file-provider semantics, data-protection behavior, legacy
asset migration timing, and interruption windows still require Apple runtime
evidence. The Share Extension must never gain access to the authoritative task
database, and a migration must never delete the only valid image copy.

**Closure evidence required:** A full Xcode build followed by physical-device tests
proving pending capture in the App Group, adoption into the host sandbox, correct
`task_capture_sources` reference, deletion of shared temporary state only after the
private copy exists, restart/replay convergence at each interruption point, safe
legacy migration, and discard cleanup. Confirm the extension cannot access host
private committed assets or `aether.db`.

**Can be addressed during unrelated work:** Yes, during Gate 1–3 Apple native
validation. Until then, keep the narrow correction and migration rather than
expanding the storage design.

### Gate 7 — Android production delivery size

**Status:** OPEN

**Current evidence:** The previously observed approximately 407 MB development APK
is a multi-ABI development artifact and is not a production download-size measure.
No release AAB or bundletool/Play delivery estimate was produced in this closure
pass; native build execution was stopped at the user's direction.

**Risk:** Production delivery size and its major native-library or asset
contributors remain unknown, so optimization decisions would be speculative.

**Closure evidence required:** Generate a non-published release AAB, record its
size and bundle composition, use bundletool or supported Play tooling to estimate
a representative ARM64 device-specific compressed/download size, and identify
large native libraries/assets contributing materially. Store-side evidence may be
added later, but publication is not required to perform the local measurement.

**Can be addressed during unrelated work:** Yes, at a release/build-size, beta, or
Play preparation checkpoint when native builds are authorized. Do not publish or
optimize blindly merely to close this record.

## Adaptive Motion Engine validation gates

The adaptive motion governor, native telemetry module, blur/glass policy, and
semantic presets are implemented in `src/motion/` and `modules/aether-motion`.
This section is the durable record of what this phase can and cannot claim.
See [`ADAPTIVE_MOTION.md`](ADAPTIVE_MOTION.md) for the policy itself.

Telemetry correctness notes that remain in force:

- Android frame health is `JankStats`. iOS is variable-refresh-aware cadence
  plus system pressure. iOS does **not** expose a trustworthy realtime jank
  ratio; `jankRatio` and `frameOverrunP95Ms` are `null` on iOS.
- Physical-device thermal, Power Saver, Reduce Motion, and touch-latency claims
  remain OPEN. Unit tests and compile tasks are not substitutes.
- A focused Android blur-navigation pass used ADB on a 90 Hz Samsung SM-A176B;
  its evidence is recorded under Gate G and does not close the remaining gates.

### Gate A — TypeScript / lint / unit suite

**Status:** PASS

**Current evidence:** `bun run typecheck` exit 0. `bun test` 330 passed,
2 skipped, 0 failed. `bun run lint` exit 0 with 0 errors across the repository
after migrating `Sheet.tsx` to native-first presentation.

**Risk:** Policy tests cannot prove device smoothness.

**Closure evidence required:** `bun run typecheck`, `bun run lint`, and
`bun test` passing on the motion and UI changes.

**Can be addressed during unrelated work:** Yes, whenever the suite is run.

### Gate B — Android JS bundle

**Status:** PASS

**Current evidence:** `bunx expo export --platform android` wrote a Hermes
bundle to a temporary directory and that directory was deleted afterwards.

**Risk:** Autolinking or Metro resolution of `AetherMotion` could fail in a
release export even if unit tests pass.

**Closure evidence required:** `expo export --platform android` to a temporary
directory without installing or launching an app.

### Gate C — iOS JS bundle

**Status:** PASS

**Current evidence:** `bunx expo export --platform ios` wrote a Hermes bundle
to a temporary directory and that directory was deleted afterwards.

**Risk:** Same as Gate B for the iOS bundle graph.

**Closure evidence required:** `expo export --platform ios` to a temporary
directory.

### Gate D — Android native compile

**Status:** PASS

**Current evidence:** `./gradlew :app:compileDebugKotlin :app:compileDebugJavaWithJavac`
completed with exit 0. Autolinking included `aether-motion` (1.0.0). No
install, launch, or `adb` task was used. This is compile evidence, not
device smoothness evidence.

**Risk:** `JankStats`, thermal listeners, or autolinking of `aether-motion` may
fail to compile.

**Closure evidence required:** Compile-only Gradle such as `:app:compileDebugKotlin`
or `:app:assembleDebug` with no install/launch tasks.

### Gate E — Android native JVM tests

**Status:** PASS

**Current evidence:** Telemetry patch:
`./gradlew :aether-motion:testDebugUnitTest` exit 0. Autolinking listed
`aether-motion` (1.0.0). `FrameAggregatorTest` ran 8 tests including
`concurrentRecordAndSnapshotAndResetPreservesInvariants` and
`heavyConcurrentSamplingNeverExceedsRingCapacity`. `JankStats` itself is
still not executed on a device. No install, launch, or `adb` task was used.

**Risk:** JVM stubs may not exercise `JankStats` itself. They only prove mapping
and aggregation, plus thread-safety of the aggregator.

**Closure evidence required:** Gradle unit tests for the `aether-motion` module,
including the concurrency suite.

### Gate F — iOS native compile

**Status:** FAIL

**Current evidence:** Telemetry patch: scheme `AetherShareExtension`
`xcodebuild` for `iphonesimulator` succeeded after a one-line
non-optional `Data` unwrap fix. Full scheme `AETHERReminder` and isolated
scheme `AetherMotion` failed in Expo's `ExpoModulesJSI` script
(`JavaScriptCodable+Date.swift:53` ambiguous type). AetherMotion Swift
was not reached. Pure helper sources typecheck with `swiftc -typecheck`
against the iOS simulator SDK. Swift XCTest sources exist but have no
wired target, so they were not executed. No physical device was used.

**Risk:** App-level iOS compile remains blocked by ExpoModulesJSI, not by
AetherMotion or the Share Extension source that previously failed at
line 213.

**Closure evidence required:** Successful Xcode compile/link of the main
app and Share Extension, plus an AetherMotion target compile.

### Gate G — Physical low-end Android

**Status:** PARTIALLY VERIFIED

**Current evidence:** A development build was installed and exercised on a
Samsung SM-A176B running Android 16/API 36 at 90 Hz. Across 45 rapid tab presses,
development-only native tracing recorded zero blur-view remounts, target changes,
size changes, prop-driven invalidations, or repeated `setupWith` calls. Updating
only Dimezis BlurView 3.1.0 to 3.2.0 reduced `dumpsys gfxinfo` janky frames from
27.47% to 18.89%, p90 from 48 ms to 38 ms, p95 from 61 ms to 53 ms, and calculated
frame-overrun p95 from 19.52 ms to 5.42 ms in matched debug-build screen-recorded
stress runs. The post-update recording contained no gray, black, or stale blur
frame, but its capture cadence was below the panel's refresh and cannot exclude
a sub-frame artifact visible only at the full 90 Hz cadence. The in-app native diagnostics
reported 90 Hz, nominal thermal state, no low-power mode, native telemetry, and
blur enabled.

**Risk:** A budget device may still jank on `standard` if the governor recovers
too aggressively, or may look overly static if it never climbs.

**Closure evidence required:** Release or development build on a low-end Android
device. Record thermal, Power Saver, Reduce Motion, blur fallback, and task-list
behavior. Do not infer this from unit tests.

### Gate H — Physical mid-range Android

**Status:** OPEN

**Current evidence:** None.

**Closure evidence required:** Same as Gate G on a mid-range device.

### Gate I — Physical flagship Android 120 Hz

**Status:** OPEN

**Current evidence:** None.

**Risk:** High refresh and live blur together may exceed the frame budget even
on a flagship under thermal pressure.

**Closure evidence required:** 90/120 Hz flagship, including a heat-soak and
recovery observation.

### Gate J — Physical iPhone 60 Hz

**Status:** OPEN

**Current evidence:** None.

**Closure evidence required:** 60 Hz iPhone, Reduce Motion, Low Power Mode,
and glass/blur fallback.

### Gate K — Physical ProMotion iPhone

**Status:** OPEN

**Current evidence:** `CADisableMinimumFrameDurationOnPhone` is declared. That
does not prove 120 Hz delivery.

**Closure evidence required:** ProMotion iPhone observing cadence, Low Power
Mode, and thermal reduction. Do not claim 120 Hz from configuration alone.

### Gate L — Physical iPadOS

**Status:** OPEN

**Current evidence:** iPad is a first-class target in policy, but no iPad
runtime evidence exists.

**Closure evidence required:** iPad portrait/landscape and Split View, plus
Reduce Motion and Low Power Mode.

### Gate M — Thermal-throttling validation

**Status:** OPEN

**Current evidence:** Enum mapping is unit-tested. Real thermal callbacks are
not.

**Closure evidence required:** Observe native thermal transitions on Android
API 29+ and iOS `ProcessInfo.thermalState` while the governor steps down and
later recovers.

### Gate N — Low Power / Power Saver validation

**Status:** OPEN

**Current evidence:** Policy tests only.

**Closure evidence required:** Toggle platform power-saving on physical Android
and iOS and confirm the ceiling becomes `standard` without removing causal
feedback.

### Gate O — Reduce Motion validation

**Status:** OPEN

**Current evidence:** Policy tests only.

**Closure evidence required:** Enable Reduce Motion on physical Android and
iOS and confirm the profile stays `minimal` after frames recover.
