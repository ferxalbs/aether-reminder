# AETHER Native-First UI Audit

## Executive result

This is a documentation-only audit of the meaningful reusable UI and system-like surfaces under `src/app/`, `src/components/`, `src/motion/`, and `modules/`. It does not change application code, dependencies, configuration, navigation, or native modules.

The audit identified 32 meaningful audit units. Some rows intentionally group a shared mechanism used by several closely related components; the counts below are counts of those primary audit units.

| Classification | Count | Result                                                |
| -------------- | ----: | ----------------------------------------------------- |
| N0             |     5 | Native-backed / correct                               |
| N1             |    10 | Semantic wrapper over native                          |
| N2             |     4 | Generic React Native but acceptable                   |
| N3             |     0 | Native migration candidate                            |
| N4             |     0 | Strong fake-native / architecture debt                |
| N5             |    12 | Genuinely custom product surface                      |
| N6             |     1 | Insufficient evidence; runtime investigation required |

There are no P0 hazards established by static inspection. The highest-value initial migrations (`Sheet`, `Picker`, `ToggleSwitch`, and `ModelCatalogSheet`) have been completed as native-first semantic adapters. All N4 findings are now resolved (count: 0). The remaining open investigation is the N6 runtime seam for keyboard/IME and back handling across floating chrome and sheet surfaces.

The existing `Sheet` migration is accepted as the reference architecture. `TaskEditorSheet`, `RecoverySheet`, and `ModelCatalogSheet` are treated as native transient-sheet consumers. `AssistantSheet` remains Class C and N5 as instructed.

## Authority and audit method

The repository instructions and baseline files were read before source inspection: `AGENTS.md`, `CLAUDE.md`, `RULES.md`, `docs/KNOWN_TRADEOFFS.md`, `package.json`, `app.json`, and `CHANGELOG.md`.

The repository knowledge graph was used first for architecture and symbol discovery, followed by targeted source inspection and literal searches for system-like APIs, platform forks, overlays, controls, gestures, Reanimated ownership, blur/glass, keyboard, haptics, notifications, capture, and accessibility semantics.

The primary API authority was the exact Expo SDK 57 documentation:

- [`@expo/ui` overview](https://docs.expo.dev/versions/v57.0.0/sdk/ui/), including Universal, Jetpack Compose, SwiftUI, and drop-in replacement inventories.
- [`@expo/ui` Universal Picker](https://docs.expo.dev/versions/v57.0.0/sdk/ui/universal/picker/), Universal Switch, and Universal Checkbox.
- [`@expo/ui` Menu](https://docs.expo.dev/versions/v57.0.0/sdk/ui/drop-in-replacements/menu/) and [`SegmentedControl`](https://docs.expo.dev/versions/v57.0.0/sdk/ui/drop-in-replacements/segmentedcontrol/).
- [`@expo/ui` community BottomSheet](https://docs.expo.dev/versions/v57.0.0/sdk/ui/drop-in-replacements/bottomsheet/) and the Universal [`BottomSheet`](https://docs.expo.dev/versions/v57.0.0/sdk/ui/universal/bottomsheet/).
- [`Expo Router`](https://docs.expo.dev/versions/v57.0.0/sdk/router/) and [`expo-router/ui`](https://docs.expo.dev/versions/v57.0.0/sdk/router/ui) for native presentation and custom tab-layout boundaries.
- [`expo-haptics`](https://docs.expo.dev/versions/v57.0.0/sdk/haptics/), [`expo-glass-effect`](https://docs.expo.dev/versions/v57.0.0/sdk/glass-effect/), and [`expo-blur`](https://docs.expo.dev/versions/v57.0.0/sdk/blur-view/).
- [`expo-notifications`](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/), [`expo-sharing`](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/), [`expo-document-picker`](https://docs.expo.dev/versions/v57.0.0/sdk/document-picker/), and [`expo-image-picker`](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/) for system interaction coverage.

The audit did not treat the existence of an API as sufficient evidence for N3 or N4. The candidate must preserve the actual AETHER contract and remove meaningful JS, animation, gesture, overlay, accessibility, focus, back, or lifecycle ownership.

## Primary audit table

| Component / Surface | File | Current mechanism | Classification | Desired owner | Native candidate | Benefit | Risk | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Alert.alert` confirmations and errors | `src/app/_layout.tsx:195-214`; `src/app/settings.tsx:225-374` | React Native `Alert` for destructive confirmation, validation, and error dialogs | N0 | Platform alert/dialog through React Native | Existing RN platform alert; no migration | System presentation, dismissal, accessibility, and destructive action semantics already belong to the platform | LOW | KEEP |
| Expo Router tab routing | `src/app/_layout.tsx:317-337` | One Expo Router `Tabs` navigator; custom sibling chrome derives selection from pathname | N0 | Expo Router / native navigation stack | Existing Expo Router `Tabs` | Router owns route state and transitions; no duplicate navigator | MEDIUM | KEEP |
| Status bar, safe area, and inset plumbing | `src/app/_layout.tsx:307-399`; route screens; `src/theme/useBottomChromeGeometry.ts` | Expo StatusBar and `react-native-safe-area-context` | N0 | OS system bars and safe-area provider | Existing Expo StatusBar / safe-area APIs | Platform supplies cutout and inset values instead of JS geometry emulation | LOW | KEEP |
| Universal Capture ingress | `modules/aether-capture/**`; `src/app/capture.tsx` | Android `ACTION_SEND`, Quick Settings tile, iOS share extension/App Intent, then a normal AETHER review route | N0 | Android OS / Apple system extension through the existing native adapter | Existing `aether-capture` native module | Correct system ownership for inbound share, shortcut, and Quick Settings entry | HIGH | KEEP |
| Local notification projection and actions | `src/services/notifications/**` | `expo-notifications` scheduling, reconciliation, and action listeners | N0 | OS notification service through Expo | Existing `expo-notifications` | Notifications remain system-owned; no in-app fake notification presentation was found | HIGH | KEEP |
| `Sheet` | `src/components/ui/Sheet.tsx:33-117` | `@expo/ui/community/bottom-sheet` with AETHER header/footer/content adapter | N1 | Mixed through semantic adapter: AETHER semantics; Compose/SwiftUI presentation | Existing community BottomSheet; Android Compose Material 3 and Apple SwiftUI | Native sheet physics, scrim dismissal, back behavior, and IME integration are not duplicated in JS | HIGH | KEEP |
| `TaskEditorSheet` / `RecoverySheet` presentation | `src/components/ui/TaskEditorSheet.tsx`; `src/components/ui/RecoverySurface.tsx` | Both delegate presentation to `Sheet`; content remains React Native | N1 | Mixed through semantic adapter | Existing `Sheet` | Native transient-sheet ownership is already correct while domain content stays AETHER-owned | MEDIUM | KEEP |
| `AddTaskModal` compatibility adapter | `src/components/ui/AddTaskModal.tsx:14-27` | Thin prop adapter to `TaskEditorSheet` | N1 | AETHER semantic adapter | Existing `TaskEditorSheet` / `Sheet` | No second modal implementation or presentation lifecycle | LOW | KEEP |
| `NativeDateTimeControl` | `src/components/ui/NativeDateTimeControl.tsx:41-136` | `@expo/ui/community/datetime-picker`; iOS compact control and Android dialog presentation | N1 | Mixed through semantic adapter: AETHER labels/values; native date/time control | Existing Expo UI DateTimePicker | Native picker dialog/compact control, focus, dismissal, and date/time semantics are already delegated | MEDIUM | KEEP |
| `GlassSurface` | `src/components/ui/GlassSurface.tsx:27-103` | AETHER material wrapper; route-local Android fallback when no safe blur target exists | N1 | Mixed through semantic adapter | Existing `AdaptiveGlass` / `AdaptiveBlur` | Centralizes material policy and prevents product components from bypassing blur safety | HIGH | KEEP |
| `AdaptiveBlur` / `AdaptiveGlass` | `src/motion/components/AdaptiveBlur.tsx`; `src/motion/components/AdaptiveGlass.tsx` | `BlurView` and `GlassView` are confined to the motion adapter with policy-based fallback | N1 | Expo native material adapter with AETHER policy | Existing `expo-blur` / `expo-glass-effect` | Native glass/blur where supported, translucent fallback when not safe or available | VERY HIGH | KEEP; runtime gate remains |
| Haptic semantic adapter | `src/lib/haptics.ts:1-51` | Maps AETHER impact/selection/notification intents to Expo iOS and Android haptic APIs | N1 | Expo native adapter / OS haptics | Existing `expo-haptics` | Platform-specific haptic semantics without custom vibration code | MEDIUM | KEEP |
| `ToggleSwitch` | `src/components/ui/ToggleSwitch.tsx` | Native platform adapter: `@expo/ui/jetpack-compose` `Switch` on Android (with semantic tokens), `@expo/ui/swift-ui` `Toggle` on Apple | N1 | Mixed through semantic adapter: AETHER setting semantics; Android Compose / Apple SwiftUI control | Existing native Switch adapter | Native switch physics, animations, VoiceOver/TalkBack role/state, and dynamic Material 3 palettes without Reanimated | MEDIUM | COMPLETED |
| Reusable `Picker` | `src/components/ui/Picker.tsx` | Native platform adapter: `@expo/ui` Universal Picker (`ExposedDropdownMenuBox` on Android, SwiftUI `Picker(.menu)` on Apple) with typed domain value mapping | N1 | Mixed through semantic adapter: AETHER field/validation semantics; native picker/menu | Existing Universal Picker adapter | Native dropdown/menu presentation, outside/back dismissal, and accessibility without custom JS menu state | MEDIUM | COMPLETED |
| Settings model catalog sheet | `src/components/ui/ModelCatalogSheet.tsx`; `src/app/settings.tsx` | Native `Sheet` adapter (`@expo/ui/community/bottom-sheet`) with AETHER search/capability/selection content | N1 | Mixed through semantic adapter: AETHER semantics; Compose/SwiftUI sheet presentation | Existing `Sheet` adapter | Native sheet physics, scrim, dismissal, detents, and system back are not duplicated in JS | MEDIUM | COMPLETED |
| Text fields and assistant text input | `src/components/ui/TextField.tsx`; `src/components/assistant/AssistantComposer.tsx` | React Native `TextInput` with AETHER label, border, leading/trailing, multiline, and secure-entry composition | N2 | React Native native-backed input plus AETHER styling | `@expo/ui` Universal TextInput exists, but its API/layout tradeoffs do not establish a material contract win here | Preserves custom field composition, multiline behavior, focus callbacks, and keyboard integration | MEDIUM | KEEP |
| Capture-route keyboard adaptation | `src/app/capture.tsx:157-219` | `KeyboardAvoidingView` around a normal route with one editable title field | N2 | React Native + OS IME insets | No better SDK 57 primitive established for this regular screen | One bounded keyboard adaptation with no custom sheet physics or gesture lifecycle | MEDIUM | KEEP pending device QA |
| `AnimatedPressable` | `src/components/ui/AnimatedPressable.tsx:35-109` | RN Pressable with AETHER press-scale motion, reduced-motion policy, Expo haptics, and opt-in shape-aware feedback clipping | N2 | React Native for interaction; AETHER for branded feedback | No native system control matches this cross-product press-feedback contract | Shared product feedback primitive; not a fake button or menu | MEDIUM | KEEP |
| `NumberStepper` | `src/components/ui/TaskEditorSheet.tsx:111-149` | Two AETHER `IconButton` actions with bounded numeric state | N2 | React Native / AETHER domain control | No suitable Universal Stepper is exposed in the inspected SDK 57 `@expo/ui` surface | Keeps recurrence interval, day, and occurrence semantics in a small bounded control | MEDIUM | KEEP |
| Settings theme preference selector | `src/app/settings.tsx:1029-1086` | Three `AnimatedPressable` segments in a custom pill container for System, OLED Dark, and Light | N5 | AETHER | No native candidate preserves the branded OLED pill contract; SDK 57 community SegmentedControl would compromise monochrome contrast and pill geometry | Retains branded OLED mode selector hierarchy, high-contrast pill geometry, and OLED Dark identity | LOW | KEEP custom |
| `AssistantSheet` | `src/components/assistant/AssistantSheet.tsx:160-713` | AETHER-owned compact/medium/full assistant surface with chat history, receipts, voice meter, confirmation workflow, custom scrim, and Reanimated height/keyboard motion | N5 | Mixed through semantic adapter: AETHER owns the Class C surface and workflow; platform owns its child text input/audio/system APIs | No native candidate safely satisfies the multi-surface assistant contract; do not reopen the Class C decision | Custom surface geometry and state are the product; replacing it with a generic sheet would sacrifice conversation, voice, receipts, and embedded confirmation behavior | VERY HIGH | KEEP custom |
| App bottom navigation and `NavigationButton` | `src/components/assistant/AppBottomNavigation.tsx:33-85` | Custom floating glass capsule, pathname-derived selection, keyboard/assistant visibility policy, and product-specific active indicator; Router remains the navigator | N5 | Mixed: Expo Router owns routing; AETHER owns visual chrome and visibility policy | `expo-router/ui` is a headless custom-tab API, not a native OS tab bar; native tabs would not preserve the floating AETHER dock contract | Retains the center-free floating layout, product material, and assistant-aware visibility without a second navigator | HIGH | KEEP custom |
| `AetherComposer` | `src/components/ui/AetherComposer.tsx:27-121` | Branded glass composer combining text input, create action, voice action, and product entry affordance | N5 | AETHER | No native composer primitive preserves the combined reminder/voice contract | Product-owned composition and action policy; its input remains a normal RN native-backed text field | HIGH | KEEP custom |
| Buttons, icon buttons, and toolbar buttons | `src/components/ui/Button.tsx`; `src/components/ui/IconButton.tsx`; `src/components/ui/AetherToolbarButton.tsx` | Styled Pressable controls with AETHER variants, touch targets, haptics, ripple, loading, and branded materials | N5 | AETHER with React Native Pressable and Expo haptics | `@expo/ui` Button/IconButton primitives do not preserve AETHER variants, loading treatment, destructive styling, and glass policy | Custom styling and action semantics are product-owned; native button existence alone is not a migration reason | MEDIUM | KEEP custom |
| AETHER toolbar and toolbar groups | `src/components/ui/AetherToolbar.tsx`; `src/components/ui/AetherToolbarGroup.tsx` | Safe-area-aware product toolbar with platform-specific grouping/material treatment | N5 | AETHER | No single Expo SDK 57 toolbar primitive preserves this adaptive AETHER layout | Custom toolbar geometry is presentation chrome, not a system navigation bar reimplementation | MEDIUM | KEEP custom |
| Task completion affordance | `src/components/ui/TaskCard.tsx:31-190` | Hand-drawn checkbox-like control plus completion check animation, text opacity/strike state, haptic result feedback, and task action coupling | N5 | AETHER | `@expo/ui` Universal Checkbox exists, but using it would change a branded completion affordance and its coupled card animation | The control is part of the product’s task-completion feedback, not an isolated settings checkbox; revisit only if visual/product requirements change | MEDIUM | KEEP custom |
| Date, time, recurrence, and weekday choice pills | `src/components/ui/TaskEditorSheet.tsx:71-109`; `:484-661` | Wrapping AETHER `ChoicePill` groups, including multi-select weekdays and domain presets | N5 | AETHER | Segmented control is not suitable for the wrapping, multi-select, and domain-specific preset contract | These are reminder-domain choices, not generic system segmented controls | MEDIUM | KEEP custom |
| Cards, lists, attention, and recovery content | `src/components/ui/Card.tsx`; `src/components/ui/TaskList.tsx`; `src/components/ui/AttentionSurface.tsx`; `src/components/ui/RecoverySurface.tsx` | Product cards, task cells, NOW/NEXT attention planning, recovery proposal rows, and domain actions | N5 | AETHER | No native list/card primitive preserves the information hierarchy and task/recovery semantics | Content layout, emphasis, undo/recovery actions, and adaptive iPad width are product-owned | HIGH | KEEP custom |
| Undo and notification-sync banners | `src/components/ui/TaskUndoBanner.tsx`; `src/components/ui/NotificationSyncBanner.tsx` | Persistent in-app alert surfaces with Undo or Retry actions and live-region semantics | N5 | AETHER | Compose Snackbar is not cross-platform and would not preserve persistent domain action state; these are not OS notifications or toasts | Keeps real undo/retry workflows visible and user-actionable | MEDIUM | KEEP custom |
| Assistant voice controls and audio meter | `src/components/assistant/AssistantVoiceButton.tsx`; `src/components/ui/AetherVoiceCapture.tsx`; `VoiceBar` | Product voice states, microphone action, waveform/meter, cancel/stop/retry, and voice error affordances | N5 | AETHER plus native audio/permission APIs | No native system UI primitive represents this voice-reminder workflow | Audio capture and permission services remain native-backed; the stateful visual workflow is product-owned | HIGH | KEEP custom |
| Markdown assistant rendering and AETHER mark | `src/components/ui/SimpleMarkdown.tsx`; `src/components/ui/AetherMark.tsx` | Product text rendering and brand mark | N5 | AETHER | No native equivalent is contract-compatible | Domain output formatting and brand identity are not system primitives | LOW | KEEP custom |
| Native presentation IME/back seam | `src/components/ui/TaskEditorSheet.tsx:391-685`; `src/components/assistant/AssistantHost.tsx:99-320` | Task editor uses iOS `KeyboardAvoidingView`; assistant uses raw keyboard end-coordinate height, custom bottom shift, and a visible-state Android `BackHandler` | N6 | Mixed through semantic adapters, subject to runtime evidence | Existing native sheet IME/back behavior plus Expo Router/Android predictive back are relevant, but static source cannot prove whether the remaining JS adaptation is necessary or duplicative | Potentially removes duplicate keyboard offset and custom back lifecycle, but the product contract and native-host behavior require device validation first | HIGH | P2 runtime investigation |

Interaction feedback shape must match the visual surface shape; touch-target geometry and feedback geometry are separate concerns.

## Outstanding N4 Findings

All prior N4 findings have been resolved (N4 count: 0). The Settings model catalog has been migrated to AETHER's native-first `Sheet` architecture (`ModelCatalogSheet`).

### Settings Model Catalog Decision

- **Prior classification:** N4 — Strong fake-native / architecture debt candidate
- **Final classification:** N1 — Semantic wrapper over native presentation adapter (`Sheet`)
- **Product contract:** Open the catalog from Settings, search models/providers, view context lengths and capability status, force-refresh the catalog, select an agent-ready model (`canRunAsAgent`), persist to `useSettingsStore`, and dismiss back directly to the Settings screen.
- **Architectural comparison:**
  1. _Candidate A (AETHER Native-Backed `Sheet`) [CHOSEN]:_ Backed by `@expo/ui/community/bottom-sheet` (Jetpack Compose Material 3 `ModalBottomSheet` on Android, SwiftUI `sheet` on Apple platforms). Accurately matches the transient in-situ picker semantics of `TaskEditorSheet` and `RecoverySheet` without creating an artificial route identity or refactoring the single `Tabs` root layout into a nested stack.
  2. _Candidate B (Expo Router `formSheet`) [REJECTED]:_ Rejected because the catalog does not have or need route identity, deep-linking, independent navigation history, or nested route stack lifecycle.
- **Implementation:** Created `src/components/ui/ModelCatalogSheet.tsx` which embeds model search, capability filtering, empty/error/loading states, and selection logic inside the native `Sheet` primitive with `snapPoints={['90%']}`. Removed custom React Native `Modal`, custom scrim, fixed 75% height container, and manual close button from `src/app/settings.tsx`.

## Theme Preference Selector Decision

- **Prior classification:** N3 — Native migration candidate
- **Final classification:** N5 — Genuinely custom AETHER product control
- **Product contract:** The Settings theme selector is a prominent, branded three-mode chooser across `"dark"` (`"OLED Dark"`), `"light"` (`"Light"`), and `"system"` (`"System"`). It provides immediate controlled theme switching and synchronous persistence through `useSettingsStore` without modal, sheet, or popup layers. Visually, it is embedded directly in the OLED Settings card as a full-width capsule (`Radius.pill: 9999`) with high-contrast active pill highlight (`colors.accent` on `#121215` raised surface).
- **Native candidate considered:** `@expo/ui/community/segmented-control` (Jetpack Compose `SingleChoiceSegmentedButtonRow` on Android and SwiftUI `Picker` with `pickerStyle('segmented')` on Apple).
- **Why migration is not justified:**
  1. _Visual & Product Identity Compromise:_ Physical Android runtime evidence confirms the selector operates as a hero mode chooser integrated into AETHER's monochrome OLED design language. Expo SDK 57 documentation explicitly documents that for `@expo/ui/community/segmented-control`, `momentary`, `backgroundColor`, `fontStyle`, and `activeFontStyle` props are not supported, and `tintColor` only works on Android while having no effect on iOS. Adopting the native control would force standard platform-default segmented button geometry (Material 3 rounded rectangles or iOS fixed-height gray segmented controls), destroy the high-contrast pitch-black/white capsule treatment, and dilute AETHER's signature "OLED Dark" visual prominence.
  2. _Bounded Implementation with Zero Platform Lifecycle Debt:_ The current component is ~55 lines of controlled React Native code mapping 3 `AnimatedPressable` instances. It owns no custom gesture pan physics, no sliding thumb math/interpolation, no dropdown/rotor menus, no system back handlers, no IME keyboard seams, and no focus lifecycle races.
  3. _State & Accessibility Simplicity:_ Theme state is synchronously read and controlled from `useSettingsStore`. Selection triggers standard AETHER press-scale motion and haptics. Labels are explicit and fully legible.
  4. _False Economy of Native-First:_ Replacing 3 simple pressable buttons with a native platform wrapper would sacrifice core brand identity and visual coherence for negligible architectural simplification.
- **Runtime/visual evidence used:** Physical Android screenshot in OLED dark mode demonstrating full-width capsule geometry, high-contrast monochrome segment fill against `#121215` raised surface, visual grouping with the section header, and clear differentiation from the boolean switches below.
- **Future reconsideration trigger:** Reconsider only if Expo UI introduces a universal segmented primitive supporting full custom container/segment background tokens, custom pill radii, and cross-platform tinting, or if AETHER adopts platform-standard settings styling across all platforms.

## Context Menu and Quick Actions Menu Decision

- **Prior classification:** N4 — Strong fake-native / architecture debt candidate
- **Final decision:** DELETED — Dead / unconsumed architecture removed
- **Audit findings:**
  1. _Zero Active Consumers:_ Exhaustive literal and graph search confirmed zero runtime callers, zero route imports, and zero unit tests referencing `AetherContextMenu` or `AetherQuickActionsMenu`.
  2. _Non-Existent Domain Capabilities:_ The scaffolded quick actions included "Add location" and "Attach file", which correspond to no existing product capabilities, domain models, or database schemas. "Add date" and "Set priority" are handled directly by `TaskEditorSheet`.
  3. _Unused Floating Chrome Scaffold:_ In `AetherComposer`, the `[ + ]` button directly opens `TaskEditorSheet` (`openEditor()`), with no popup context menu trigger.
  4. _Safe Removal:_ Deleting `AetherContextMenu.tsx`, `AetherQuickActionsMenu.tsx`, and the now-orphaned `AetherContextSurface.tsx` removed dead fake-native debt without breaking builds, typechecking, or tests.

## N6 unresolved runtime seams

The `TaskEditorSheet` content is hosted inside the already-native `Sheet` but still wraps its React Native form in an iOS `KeyboardAvoidingView`. `AssistantHost` separately listens to keyboard events, translates a custom AssistantSheet by the raw end-coordinate height, and registers a visible-state Android back handler. Static inspection cannot establish whether each layer is necessary for the native host hierarchy or whether any layer double-applies IME/inset behavior.

This is not classified as N3/N4 yet because the relevant native-host and predictive-back behavior is not proven without physical Android/iPhone/iPad validation. The existing handler cleanup and visible-state guard are directionally correct. The investigation must include keyboard focus, rotation/resizing, split keyboard or iPad multitasking where applicable, route transitions, assistant open/close, back handling order, and repeated mount/unmount cycles.

## Correctly custom / Do not migrate

These surfaces may contain native-backed child controls, but the surrounding product behavior is intentionally AETHER-owned:

- `AssistantSheet`: Class C. Its compact/medium/full state machine, conversation history, receipts, voice capture states, embedded confirmation workflow, and custom scrim are the product. Do not replace it with a generic native sheet without a new product contract.
- `AppBottomNavigation`: Router owns route state, while AETHER owns the floating dock, active indicator, keyboard/assistant visibility, and material treatment. Native tabs would not preserve the contract.
- `AetherComposer`: the combined reminder input, voice entry, send action, and product add affordance are a branded composer, not a system control.
- `TaskCard` completion: the checkbox-like affordance is coupled to task completion haptics, check animation, text opacity, and strike treatment. `@expo/ui` Checkbox is an available primitive, but its existence alone does not justify changing this product contract.
- `ChoicePill` groups and recurrence/date/time presets: these include wrapping date presets, time presets, recurrence options, multi-select weekdays, and domain-specific state. They are not one generic segmented control.
- Settings theme preference selector: a branded three-way mode chooser (`"OLED Dark"`, `"Light"`, `"System"`) rendered as an integrated full-width pill container with high-contrast active pill highlight. It has no gesture, modal, back, or IME lifecycle complexity, and native segmented control primitives in SDK 57 (Compose SegmentedButton / SwiftUI segmented Picker) would degrade monochrome contrast, pill geometry, and OLED Dark identity without architectural benefit.
- `NumberStepper`: bounded recurrence values are a small domain control. SDK 57’s inspected Universal inventory does not provide a cross-platform Stepper primitive that materially improves this contract.
- `Button`, `IconButton`, `AetherToolbarButton`, `AetherToolbar`, and `AetherToolbarGroup`: these own AETHER styling, touch target policy, loading/destructive states, glass policy, and toolbar layout. Native buttons/toolbars are not automatic replacements.
- `Card`, `TaskList`, `AttentionSurface`, `RecoverySummary`, and recovery content: task/recovery information hierarchy and actions are product semantics, including adaptive width behavior.
- `TaskUndoBanner` and `NotificationSyncBanner`: these are persistent, action-bearing in-app states. They are not fake OS notifications and should not be replaced with a transient snackbar merely because a snackbar exists.
- `AssistantVoiceButton`, `AetherVoiceCapture`, and `VoiceBar`: audio capture and permissions can be native-backed, but the voice-reminder workflow, meter, retry, cancel, and error states are AETHER UI.
- `TextField` and the capture route’s `KeyboardAvoidingView`: custom field composition and a normal route’s keyboard adaptation are acceptable without evidence of a material native contract benefit.
- `SimpleMarkdown` and `AetherMark`: assistant output formatting and brand identity are not platform primitives.

## Already native-backed

The following reusable or system-facing pieces already follow the preferred direction:

- `Sheet` delegates modal bottom-sheet behavior to `@expo/ui/community/bottom-sheet`; AETHER owns semantic content and callbacks.
- `TaskEditorSheet` and `RecoverySheet` delegate sheet presentation to `Sheet`.
- `ModelCatalogSheet` delegates model catalog selection sheet presentation to `Sheet`.
- `AddTaskModal` is a thin prop adapter delegating to `TaskEditorSheet` / `Sheet`.
- `NativeDateTimeControl` delegates date/time selection to `@expo/ui/community/datetime-picker`.
- `ToggleSwitch` delegates switch interaction directly to `@expo/ui/jetpack-compose` `Switch` on Android (with semantic tokens) and `@expo/ui/swift-ui` `Toggle` on Apple.
- `Picker` delegates single-selection and dropdown/rotor interaction to `@expo/ui` Universal Picker (`ExposedDropdownMenuBox` on Android, SwiftUI `Picker(.menu)` on Apple).
- `GlassSurface` delegates material decisions through `AdaptiveGlass` and `AdaptiveBlur`, with the repository’s explicit Android safe-target/fallback policy.
- `AdaptiveGlass` uses `expo-glass-effect`’s `GlassView` when available on Apple platforms and approved translucent/blur fallbacks elsewhere.
- `AdaptiveBlur` is the only product-facing blur path; direct `BlurView` use is confined to that adapter. Route-local Android surfaces fall back when an explicit safe target is absent.
- `src/lib/haptics.ts` uses `expo-haptics`, including Android `performAndroidHapticsAsync`, rather than custom vibration logic.
- `Alert.alert` is a React Native bridge to platform alert/dialog behavior; no custom system-dialog recreation was found for these error/destructive flows.
- Expo Router owns the single navigation tree and route transitions; the custom bottom navigation does not create a second navigator.
- `aether-capture` owns Android share/Quick Settings and Apple share/App Intent ingress in native modules; the JS route is a review/edit screen, not a fake system share sheet.
- `expo-notifications` owns local scheduling and notification action integration; no custom replacement for the OS notification surface was found.

## Coverage notes

- `Modal`: zero active React Native modals remain in application code (Settings model catalog migrated to native `Sheet` adapter).
- `Switch`: `ToggleSwitch` is migrated to native-backed `@expo/ui/jetpack-compose` `Switch` on Android and `@expo/ui/swift-ui` `Toggle` on Apple (N1).
- `Picker`: `Picker` is migrated to native-backed `@expo/ui` Universal Picker (N1).
- Segmented controls: the Settings theme selector is classified N5 as a branded AETHER mode chooser whose pill geometry and monochrome contrast are intentional product identity. Task-editor choice pills also remain N5 because their product contract includes wrapping presets and multi-select weekdays.
- Context menus: the unconsumed AETHER menu components (`AetherContextMenu`, `AetherQuickActionsMenu`, and orphaned `AetherContextSurface`) were audited and deleted as dead architecture. No active long-press/context-menu surface exists in the application.
- Date/time: `NativeDateTimeControl` is already native-backed. Surrounding date/time preset pills remain product-owned.
- Gestures: no `GestureDetector`, `PanResponder`, or manual pan/responder physics were found in the audited product UI. Reanimated remains in product motion, the custom AssistantSheet, task completion feedback, and navigation indicator.
- Keyboard: `KeyboardAvoidingView` appears in the task editor and capture route; keyboard listeners appear in the custom bottom navigation and AssistantHost. The native-presentation IME seam is the single N6 runtime finding.
- Blur/glass: no product component directly bypasses `AdaptiveBlur`; the root `BlurTargetView` is a sibling target for floating chrome, and route-local surfaces use the approved fallback when no safe target is passed. No statically visible recursive target hierarchy was found.
- Sharing and pickers: there is no `expo-sharing`, `expo-document-picker`, or `expo-image-picker` dependency/usage. Incoming share/capture ingress is native-backed in `modules/aether-capture`.
- Platform forks: inline `Platform.OS` branches exist for native adapters and platform-specific product geometry; no `.ios.tsx`, `.android.tsx`, or `.native.tsx` UI fork was found.
- Accessibility: native controls (`Sheet`, `Picker`, `ToggleSwitch`, `NativeDateTimeControl`) delegate platform-native accessibility roles and state. Custom components preserve AETHER labels, hints, and error/live-region behavior.

## Migration roadmap

This roadmap is conservative and audit-only. Each item is independently testable and should be a separate commit.

### Wave 0 — hazards and evidence only

- Validate the N6 IME/back seam for `TaskEditorSheet`, `AssistantHost`, and `AssistantSheet` on physical Android, iPhone, and iPad where available.
- Validate the existing `BlurTargetView` sibling hierarchy around `Tabs`, `AppBottomNavigation`, `AssistantHost`, menus, sheets, and route transitions. Keep `AdaptiveBlur` as the only product-facing blur path.
- Capture Android logcat around overlay mount/unmount, native view lifecycle, Reanimated, and back handling before changing any overlay.

### Wave 1 — low-risk/high-value primitives (COMPLETED)

- `Picker`: COMPLETED — migrated to SDK 57 Universal Picker platform adapter (`ExposedDropdownMenuBox` on Android, SwiftUI `Picker(.menu)` on Apple).
- `ToggleSwitch`: COMPLETED — migrated to native platform adapter (`@expo/ui/jetpack-compose` `Switch` on Android, `@expo/ui/swift-ui` `Toggle` on Apple).

### Wave 2 — moderate coupling

- Re-run the N6 keyboard/back checks after control changes because Settings and task-editor focus paths are shared with global chrome and AssistantHost.

### Wave 3 — high-risk/platform-sensitive (COMPLETED)

- Settings model catalog modal: COMPLETED — evaluated and migrated to AETHER's native-backed `Sheet` adapter (`ModelCatalogSheet`), removing custom React Native `Modal`, custom scrim, and fixed 75% height styling.

### Keep custom

- `AssistantSheet` Class C and its voice/conversation/confirmation internals.
- `AppBottomNavigation`, `AetherComposer`, AETHER toolbars, cards, task cells, recovery/attention surfaces, task completion affordance, domain choice pills, banners, and voice meter.
- Settings theme preference selector (branded OLED mode chooser).
- `TextField` and normal-route `KeyboardAvoidingView` unless runtime evidence identifies a concrete duplication or defect.
- `GlassSurface`, `AdaptiveBlur`, and `AdaptiveGlass` architecture; do not bypass their safety policy or introduce direct product `BlurView` usage.

## Validation

Validation performed:

- `bun test src/components/ui/ModelCatalogSheet.test.tsx` (all 8 tests pass)
- `bun test src/` (all 353 unit tests pass)
- `bun run typecheck` (0 errors)
- `bun run lint` (0 errors)
- `git diff --check` (0 whitespace issues)
- `bunx expo export --platform android` (clean bundle export)
- `bunx expo export --platform ios` (clean bundle export)
- `./gradlew :app:compileDebugKotlin` (BUILD SUCCESSFUL)

Physical Android/iPhone/iPad runtime validation was not performed in this session as no physical device was attached. The report distinguishes statically established architecture from the N6 runtime seams and the existing device/build gates recorded in `docs/KNOWN_TRADEOFFS.md`.
