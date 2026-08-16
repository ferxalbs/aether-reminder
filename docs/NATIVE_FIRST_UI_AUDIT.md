# AETHER Native-First UI Audit

## Executive result

This is a documentation-only audit of the meaningful reusable UI and system-like surfaces under `src/app/`, `src/components/`, `src/motion/`, and `modules/`. It does not change application code, dependencies, configuration, navigation, or native modules.

The audit identified 34 meaningful audit units. Some rows intentionally group a shared mechanism used by several closely related components; the counts below are counts of those primary audit units.

| Classification | Count | Result |
| --- | ---: | --- |
| N0 | 5 | Native-backed / correct |
| N1 | 7 | Semantic wrapper over native |
| N2 | 4 | Generic React Native but acceptable |
| N3 | 1 | Native migration candidate |
| N4 | 3 | Strong fake-native / architecture debt |
| N5 | 13 | Genuinely custom product surface |
| N6 | 1 | Insufficient evidence; runtime investigation required |

There are no P0 hazards established by static inspection. The highest-value first migration is the reusable `Picker`, because it is a direct single-selection/menu reimplementation used throughout the task editor. The highest-risk candidate is the settings model catalog modal because it combines a custom sheet presentation with async loading, search keyboard behavior, settings state, navigation coupling, and iPadOS adaptation.

The existing `Sheet` migration is accepted as the reference architecture. `TaskEditorSheet` and `RecoverySheet` are treated as native transient-sheet consumers. `AssistantSheet` remains Class C and N5 as instructed.

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
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
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
| Text fields and assistant text input | `src/components/ui/TextField.tsx`; `src/components/assistant/AssistantComposer.tsx` | React Native `TextInput` with AETHER label, border, leading/trailing, multiline, and secure-entry composition | N2 | React Native native-backed input plus AETHER styling | `@expo/ui` Universal TextInput exists, but its API/layout tradeoffs do not establish a material contract win here | Preserves custom field composition, multiline behavior, focus callbacks, and keyboard integration | MEDIUM | KEEP |
| Capture-route keyboard adaptation | `src/app/capture.tsx:157-219` | `KeyboardAvoidingView` around a normal route with one editable title field | N2 | React Native + OS IME insets | No better SDK 57 primitive established for this regular screen | One bounded keyboard adaptation with no custom sheet physics or gesture lifecycle | MEDIUM | KEEP pending device QA |
| `AnimatedPressable` | `src/components/ui/AnimatedPressable.tsx:35-109` | RN Pressable with AETHER press-scale motion, reduced-motion policy, and Expo haptics | N2 | React Native for interaction; AETHER for branded feedback | No native system control matches this cross-product press-feedback contract | Shared product feedback primitive; not a fake button or menu | MEDIUM | KEEP |
| `NumberStepper` | `src/components/ui/TaskEditorSheet.tsx:111-149` | Two AETHER `IconButton` actions with bounded numeric state | N2 | React Native / AETHER domain control | No suitable Universal Stepper is exposed in the inspected SDK 57 `@expo/ui` surface | Keeps recurrence interval, day, and occurrence semantics in a small bounded control | MEDIUM | KEEP |
| `ToggleSwitch` | `src/components/ui/ToggleSwitch.tsx:28-109` | Hand-rendered switch: `AnimatedPressable`, Reanimated spring, interpolated track/thumb colors and translation, manual switch accessibility | N3 | Mixed through semantic adapter: AETHER setting semantics; Android Compose / Apple SwiftUI control | [`@expo/ui` Universal Switch](https://docs.expo.dev/versions/v57.0.0/sdk/ui/universal/switch/) | Removes custom track/thumb animation, press semantics, and manual switch state synchronization | MEDIUM | P1 |
| Settings theme preference selector | `src/app/settings.tsx:1029-1086` | Three `AnimatedPressable` segments in a custom pill container for System, OLED Dark, and Light | N5 | AETHER | No native candidate preserves the branded OLED pill contract; SDK 57 community SegmentedControl would compromise monochrome contrast and pill geometry | Retains branded OLED mode selector hierarchy, high-contrast pill geometry, and OLED Dark identity | LOW | KEEP custom |
| Reusable `Picker` | `src/components/ui/Picker.tsx:33-205` | JS `open` state, custom trigger, inline menu, radio semantics, per-item disabled logic, and an iOS hand-built segmented branch | N4 | Mixed through semantic adapter: AETHER field/validation semantics; native picker/menu | [`@expo/ui` Universal Picker](https://docs.expo.dev/versions/v57.0.0/sdk/ui/universal/picker/) with `appearance="menu"` | Removes manual menu lifecycle, option rendering, expanded state, radio semantics, and platform dropdown/rotor emulation | MEDIUM | P1 |
| Settings model catalog modal | `src/app/settings.tsx:1508-1750` | React Native `Modal`, custom scrim, fixed 75% bottom sheet, close button, search field, async list, selection, and `onRequestClose` | N4 | Expo Router native presentation plus AETHER route/content state | Expo Router `presentation: "formSheet"` with native sheet options; existing `Sheet` is an alternate transient adapter | Removes custom presentation host, scrim, fixed sheet geometry, and modal lifecycle while retaining the searchable catalog content | HIGH | P1 |
| `AetherContextMenu` / `AetherQuickActionsMenu` | `src/components/ui/AetherContextMenu.tsx`; `src/components/ui/AetherQuickActionsMenu.tsx` | Custom `AetherContextSurface`, animated entry/exit, separators, and Pressable action rows | N4 | Mixed through semantic adapter: AETHER action policy; native menu presentation | [`@expo/ui/community/menu`](https://docs.expo.dev/versions/v57.0.0/sdk/ui/drop-in-replacements/menu/) (`MenuView`): Compose `DropdownMenu` on Android, SwiftUI `Menu`/`ContextMenu` on Apple | Removes custom popup surface/list hierarchy and delegates anchoring, outside dismissal, back, and menu accessibility | MEDIUM | P2 if retained |
| `AssistantSheet` | `src/components/assistant/AssistantSheet.tsx:160-713` | AETHER-owned compact/medium/full assistant surface with chat history, receipts, voice meter, confirmation workflow, custom scrim, and Reanimated height/keyboard motion | N5 | Mixed through semantic adapter: AETHER owns the Class C surface and workflow; platform owns its child text input/audio/system APIs | No native candidate safely satisfies the multi-surface assistant contract; do not reopen the Class C decision | Custom surface geometry and state are the product; replacing it with a generic sheet would sacrifice conversation, voice, receipts, and embedded confirmation behavior | VERY HIGH | KEEP custom |
| App bottom navigation and `NavigationButton` | `src/components/assistant/AppBottomNavigation.tsx:33-85` | Custom floating glass capsule, pathname-derived selection, keyboard/assistant visibility policy, and product-specific active indicator; Router remains the navigator | N5 | Mixed: Expo Router owns routing; AETHER owns visual chrome and visibility policy | `expo-router/ui` is a headless custom-tab API, not a native OS tab bar; native tabs would not preserve the floating AETHER dock contract | Retains the center-free floating layout, product material, and assistant-aware visibility without a second navigator | HIGH | KEEP custom |
| `AetherComposer` | `src/components/ui/AetherComposer.tsx:27-121` | Branded glass composer combining text input, create action, voice action, and product entry affordance | N5 | AETHER | No native composer primitive preserves the combined reminder/voice contract | Product-owned composition and action policy; its input remains a normal RN native-backed text field | HIGH | KEEP custom |
| `AetherContextSurface` | `src/components/ui/AetherContextSurface.tsx:16-48` | Product glass/translucent surface with AETHER entry/exit motion | N5 | AETHER material/product surface through `GlassSurface` | No native menu candidate should be used to replace this visual surface independently of menu behavior | It is visual product language, not the menu semantics themselves | MEDIUM | KEEP custom |
| Buttons, icon buttons, and toolbar buttons | `src/components/ui/Button.tsx`; `src/components/ui/IconButton.tsx`; `src/components/ui/AetherToolbarButton.tsx` | Styled Pressable controls with AETHER variants, touch targets, haptics, ripple, loading, and branded materials | N5 | AETHER with React Native Pressable and Expo haptics | `@expo/ui` Button/IconButton primitives do not preserve AETHER variants, loading treatment, destructive styling, and glass policy | Custom styling and action semantics are product-owned; native button existence alone is not a migration reason | MEDIUM | KEEP custom |
| AETHER toolbar and toolbar groups | `src/components/ui/AetherToolbar.tsx`; `src/components/ui/AetherToolbarGroup.tsx` | Safe-area-aware product toolbar with platform-specific grouping/material treatment | N5 | AETHER | No single Expo SDK 57 toolbar primitive preserves this adaptive AETHER layout | Custom toolbar geometry is presentation chrome, not a system navigation bar reimplementation | MEDIUM | KEEP custom |
| Task completion affordance | `src/components/ui/TaskCard.tsx:31-190` | Hand-drawn checkbox-like control plus completion check animation, text opacity/strike state, haptic result feedback, and task action coupling | N5 | AETHER | `@expo/ui` Universal Checkbox exists, but using it would change a branded completion affordance and its coupled card animation | The control is part of the product’s task-completion feedback, not an isolated settings checkbox; revisit only if visual/product requirements change | MEDIUM | KEEP custom |
| Date, time, recurrence, and weekday choice pills | `src/components/ui/TaskEditorSheet.tsx:71-109`; `:484-661` | Wrapping AETHER `ChoicePill` groups, including multi-select weekdays and domain presets | N5 | AETHER | Segmented control is not suitable for the wrapping, multi-select, and domain-specific preset contract | These are reminder-domain choices, not generic system segmented controls | MEDIUM | KEEP custom |
| Cards, lists, attention, and recovery content | `src/components/ui/Card.tsx`; `src/components/ui/TaskList.tsx`; `src/components/ui/AttentionSurface.tsx`; `src/components/ui/RecoverySurface.tsx` | Product cards, task cells, NOW/NEXT attention planning, recovery proposal rows, and domain actions | N5 | AETHER | No native list/card primitive preserves the information hierarchy and task/recovery semantics | Content layout, emphasis, undo/recovery actions, and adaptive iPad width are product-owned | HIGH | KEEP custom |
| Undo and notification-sync banners | `src/components/ui/TaskUndoBanner.tsx`; `src/components/ui/NotificationSyncBanner.tsx` | Persistent in-app alert surfaces with Undo or Retry actions and live-region semantics | N5 | AETHER | Compose Snackbar is not cross-platform and would not preserve persistent domain action state; these are not OS notifications or toasts | Keeps real undo/retry workflows visible and user-actionable | MEDIUM | KEEP custom |
| Assistant voice controls and audio meter | `src/components/assistant/AssistantVoiceButton.tsx`; `src/components/ui/AetherVoiceCapture.tsx`; `VoiceBar` | Product voice states, microphone action, waveform/meter, cancel/stop/retry, and voice error affordances | N5 | AETHER plus native audio/permission APIs | No native system UI primitive represents this voice-reminder workflow | Audio capture and permission services remain native-backed; the stateful visual workflow is product-owned | HIGH | KEEP custom |
| Markdown assistant rendering and AETHER mark | `src/components/ui/SimpleMarkdown.tsx`; `src/components/ui/AetherMark.tsx` | Product text rendering and brand mark | N5 | AETHER | No native equivalent is contract-compatible | Domain output formatting and brand identity are not system primitives | LOW | KEEP custom |
| Native presentation IME/back seam | `src/components/ui/TaskEditorSheet.tsx:391-685`; `src/components/assistant/AssistantHost.tsx:99-320` | Task editor uses iOS `KeyboardAvoidingView`; assistant uses raw keyboard end-coordinate height, custom bottom shift, and a visible-state Android `BackHandler` | N6 | Mixed through semantic adapters, subject to runtime evidence | Existing native sheet IME/back behavior plus Expo Router/Android predictive back are relevant, but static source cannot prove whether the remaining JS adaptation is necessary or duplicative | Potentially removes duplicate keyboard offset and custom back lifecycle, but the product contract and native-host behavior require device validation first | HIGH | P2 runtime investigation |

## N3/N4 findings

The following are the only findings that passed the strict native-candidate test. No implementation is proposed here.

### Picker

Current architecture:

`Picker` maintains an `open` React state, renders its own trigger and inline menu, renders each option as an `AnimatedPressable`, assigns radio roles and checked/selected state manually, and closes the menu after selection. On iOS it switches to a hand-built segmented pill whenever there are four or fewer options. It is used by the task editor for recurrence frequency, repeat timing, end mode, and priority.

Why this is a candidate:

This is a direct reimplementation of a single-selection input. The current implementation owns menu presentation, option accessibility, selection state, disabled-item handling, and dismissal. Those are the exact responsibilities that a native picker/menu should own. The issue is architectural ownership, not the AETHER label, helper text, error state, or accent styling.

Existing product contract:

The field must expose a typed single value, a visible label, optional helper/error text, disabled state, selection feedback, and a compact choice interaction. Current call sites use string/number values and do not rely on per-option disabled items.

Expo SDK 57 native candidate:

Use the SDK 57 [`@expo/ui` Universal Picker](https://docs.expo.dev/versions/v57.0.0/sdk/ui/universal/picker/) with the menu appearance as the baseline. The SDK 57 documentation explicitly describes it as a single-selection input with a platform-appropriate dropdown or rotor and recommends the Universal component over the community compatibility shim for new code.

Android implementation:

Compose-backed Universal Picker menu/dropdown owns popup presentation, selection interaction, focus, and Android dismissal behavior. AETHER would wrap it with the existing label, helper/error text, typed value bridge, and haptic policy if that policy remains required.

Apple implementation:

SwiftUI-backed Universal Picker owns the native menu/rotor behavior. The adapter must be tested in compact iPhone and regular/resizable iPad layouts. The current iOS segmented branch should not be preserved automatically; it requires product approval because it is a separate visual contract from the native menu appearance.

What AETHER should still own:

Typed domain values, option labels, field label/helper/error copy, validation, disabled field policy, selection haptic policy, and mapping the selected value into recurrence and priority state.

What the platform should own:

Trigger/menu or rotor presentation, selection semantics, focus, dismissal, back/outside behavior, native accessibility, and platform-specific picker geometry.

Expected complexity removed:

The `open` state, custom menu hierarchy, per-option `AnimatedPressable` instances, manual radio/combobox accessibility state, inline menu placement, custom dismissal path, and the associated Reanimated/gesture/view lifecycle surface.

Migration risk:

MEDIUM. There is one reusable component but several task-editor consumers, and iOS currently has a deliberate segmented appearance for small option sets. iPadOS sizing, helper/error layout, option-disabled parity, and haptic behavior need explicit acceptance before changing the shared adapter.

Runtime validation required:

Physical Android: open/close, outside dismissal, system back, TalkBack, disabled state, and repeated selection. Physical iPhone: menu/rotor behavior, VoiceOver, keyboard/focus interaction, and reduced motion. Physical iPad: regular-width placement, Split View/resizing, pointer/keyboard focus, and compact versus regular presentation.

### ToggleSwitch

Current architecture:

`ToggleSwitch` renders a track and thumb itself. A Reanimated shared value drives spring progress, interpolated colors, and thumb translation. The outer `AnimatedPressable` manually exposes switch role/state and manually calls the AETHER haptic adapter.

Why this is a candidate:

The component is a settings switch, not a product-specific slider or toggle-shaped chip. Expo SDK 57 exposes a controlled native-backed Switch with `value`, `onValueChange`, `disabled`, and an optional label. The existing implementation owns the control’s visual state machine and interaction semantics in JS/Reanimated.

Existing product contract:

Four settings rows require a controlled boolean, disabled behavior, an accessibility label/hint, persistence through the settings store, and optional selection feedback. The settings row and explanatory copy must remain AETHER-owned.

Expo SDK 57 native candidate:

[`@expo/ui` Universal Switch](https://docs.expo.dev/versions/v57.0.0/sdk/ui/universal/switch/), which is backed by the platform-native control surface and controlled by React state.

Android implementation:

Jetpack Compose Switch owns the switch interaction, state semantics, focus, and native control behavior. The AETHER adapter supplies the controlled value and callback and keeps the surrounding settings row.

Apple implementation:

SwiftUI Toggle owns the switch interaction, state semantics, focus, and Apple-native appearance. iPadOS uses the same Apple implementation with adaptive row layout rather than a parallel control.

What AETHER should still own:

Setting labels and descriptions, persistence, haptics policy, material-color preference policy, accessibility copy, and any product-level disabled/business rules.

What the platform should own:

Switch hit behavior, control semantics, focus, pressed/selected state, platform geometry, native accessibility, and the control’s state transition.

Expected complexity removed:

The Reanimated shared value, spring configuration, interpolated track/thumb colors, thumb translation, manual switch role/state, and the extra animated press layer around the control.

Migration risk:

MEDIUM. The contract is small, but the existing changelog records an intentional HIG/Material 3 custom visual decision and the setting `materialColorsEnabled` may be coupled to appearance expectations. Native appearance and accent behavior must be accepted rather than assumed.

Runtime validation required:

Physical Android and Apple devices for visual acceptance, TalkBack/VoiceOver role and state, disabled state, reduced motion, rapid toggles, persistence after leaving Settings, and iPad regular-width settings rows.

## Theme Preference Selector Decision

- **Prior classification:** N3 — Native migration candidate
- **Final classification:** N5 — Genuinely custom AETHER product control
- **Product contract:** The Settings theme selector is a prominent, branded three-mode chooser across `"dark"` (`"OLED Dark"`), `"light"` (`"Light"`), and `"system"` (`"System"`). It provides immediate controlled theme switching and synchronous persistence through `useSettingsStore` without modal, sheet, or popup layers. Visually, it is embedded directly in the OLED Settings card as a full-width capsule (`Radius.pill: 9999`) with high-contrast active pill highlight (`colors.accent` on `#121215` raised surface).
- **Native candidate considered:** `@expo/ui/community/segmented-control` (Jetpack Compose `SingleChoiceSegmentedButtonRow` on Android and SwiftUI `Picker` with `pickerStyle('segmented')` on Apple).
- **Why migration is not justified:**
  1. *Visual & Product Identity Compromise:* Physical Android runtime evidence confirms the selector operates as a hero mode chooser integrated into AETHER's monochrome OLED design language. Expo SDK 57 documentation explicitly documents that for `@expo/ui/community/segmented-control`, `momentary`, `backgroundColor`, `fontStyle`, and `activeFontStyle` props are not supported, and `tintColor` only works on Android while having no effect on iOS. Adopting the native control would force standard platform-default segmented button geometry (Material 3 rounded rectangles or iOS fixed-height gray segmented controls), destroy the high-contrast pitch-black/white capsule treatment, and dilute AETHER's signature "OLED Dark" visual prominence.
  2. *Bounded Implementation with Zero Platform Lifecycle Debt:* The current component is ~55 lines of controlled React Native code mapping 3 `AnimatedPressable` instances. It owns no custom gesture pan physics, no sliding thumb math/interpolation, no dropdown/rotor menus, no system back handlers, no IME keyboard seams, and no focus lifecycle races.
  3. *State & Accessibility Simplicity:* Theme state is synchronously read and controlled from `useSettingsStore`. Selection triggers standard AETHER press-scale motion and haptics. Labels are explicit and fully legible.
  4. *False Economy of Native-First:* Replacing 3 simple pressable buttons with a native platform wrapper would sacrifice core brand identity and visual coherence for negligible architectural simplification.
- **Runtime/visual evidence used:** Physical Android screenshot in OLED dark mode demonstrating full-width capsule geometry, high-contrast monochrome segment fill against `#121215` raised surface, visual grouping with the section header, and clear differentiation from the boolean switches below.
- **Future reconsideration trigger:** Reconsider only if Expo UI introduces a universal segmented primitive supporting full custom container/segment background tokens, custom pill radii, and cross-platform tinting, or if AETHER adopts platform-standard settings styling across all platforms.

### Settings model catalog modal

Current architecture:

Settings owns `modelPickerVisible`, renders a React Native `Modal` with `transparent` and `animationType="slide"`, adds a custom scrim and fixed-height bottom container, and owns close behavior. The modal also contains async loading/error states, a searchable `TextInput`, model capability filtering, refresh, selection, and a custom list.

Why this is a candidate:

The model catalog content is product-owned, but the presentation host is a custom modal sheet. The implementation manually owns the sheet geometry, scrim, modal close path, and presentation lifecycle. This is a navigable searchable selection surface, not merely a small inline dropdown.

Existing product contract:

Open the catalog from Settings, load and refresh available models, search by model/provider/id, show capability and availability status, select only an agent-capable model, close after selection, and support system back/cancel without losing the settings screen.

Expo SDK 57 native candidate:

Expo Router SDK 57 supports native stack presentations including `formSheet`, with `sheetAllowedDetents` and related native sheet options. The exact documentation states that `formSheet` maps to `UIModalPresentationFormSheet` on iOS and falls back to a native modal presentation on Android. The content can remain a route-owned React Native screen. The existing AETHER `Sheet` adapter is an alternate candidate only if the product decides this is a transient sheet rather than a navigable settings surface.

Android implementation:

Expo Router’s native stack owns modal presentation, scrim, system back, predictive-back integration, and IME/window behavior around the search field. AETHER owns the model list and search content inside the presented route.

Apple implementation:

The native stack owns `UIModalPresentationFormSheet` behavior, dismissal, focus, and adaptive sheet geometry. iPadOS should use the same Apple route with form-sheet/popover-adaptive layout as appropriate for the width class, not an iPhone-only custom overlay.

What AETHER should still own:

Model fetch/revalidation, search filtering, capability rules, loading/error copy, selection state, settings-store update, and route-level result handling.

What the platform should own:

Presentation host, scrim, modal lifecycle, system back/predictive back, focus/insets around the search field, dismissal gesture where supported, and iPadOS sheet geometry.

Expected complexity removed:

The React Native `Modal` presentation host, custom scrim, fixed 75% sheet geometry, custom `onRequestClose` lifecycle, and some modal-specific keyboard/back coordination. The async model list and search remain JS-owned by design.

Migration risk:

HIGH. The surface has async loading, a keyboard-driven search field, settings-store coupling, model eligibility rules, native back behavior, and iPadOS presentation choices. It also requires adding or exposing a route without creating a second navigator.

Runtime validation required:

Physical Android: open/close, predictive back, back during search, keyboard resize, refresh while open, selection, and process/lifecycle transitions. Physical iPhone: sheet dismissal, keyboard focus, VoiceOver, and selection persistence. Physical iPad: form-sheet/popover behavior in full screen, Split View, multitasking, and pointer/keyboard use.

### AetherContextMenu / AetherQuickActionsMenu

Current architecture:

`AetherContextMenu` maps item definitions to a custom `AetherContextSurface` and a list of React Native `Pressable` rows with separators. `AetherQuickActionsMenu` supplies four action items: Add date, Set priority, Add location, and Attach file. The graph and literal search found no current consumer of these exported menu components, so this is reusable architecture debt rather than a confirmed active runtime path.

Why this is a candidate:

The abstraction is explicitly a menu with menu-item selection and close-after-action behavior. It manually owns popup content, item hit targets, and menu presentation instead of delegating those semantics to a native menu. The absence of consumers lowers urgency; it does not make the implementation a good native menu architecture if it is retained.

Existing product contract:

If retained, it exposes a compact list of quick actions, each with a label/icon/action callback, and closes after an action. There is no evidence of rich embedded content, multi-level menus, custom selection state, or a required non-menu layout.

Expo SDK 57 native candidate:

SDK 57 [`@expo/ui/community/menu`](https://docs.expo.dev/versions/v57.0.0/sdk/ui/drop-in-replacements/menu/) `MenuView`. The exact docs specify Compose `DropdownMenu` on Android and SwiftUI `Menu` for tap triggers or `ContextMenu` for long-press triggers on Apple.

Android implementation:

Compose `DropdownMenu` owns anchor behavior, popup dismissal, focus, and menu semantics. AETHER maps the native action event to its semantic callback.

Apple implementation:

SwiftUI `Menu` owns tap-triggered action presentation; SwiftUI `ContextMenu` is available only if the product contract is a long-press context menu. iPadOS uses the same Apple primitive with its adaptive popover behavior.

What AETHER should still own:

Action definitions, ordering, labels, product authorization, callback behavior, and whether an action is available in the current composer/task context.

What the platform should own:

Menu popup/anchoring, outside dismissal, back behavior, focus, accessibility, and platform menu geometry.

Expected complexity removed:

The custom context surface/list hierarchy and entry/exit animation, plus the menu-specific dismissal and accessibility view hierarchy.

Migration risk:

MEDIUM if the component is reused. SDK 57 documents that Apple menus do not support programmatic opening and that the community menu wraps the trigger on Android. The current components are unconsumed, so the first decision should be whether they remain part of the product surface.

Runtime validation required:

If retained and migrated, validate Android anchor/dismissal/back, iPhone and iPad Menu presentation, VoiceOver/TalkBack action names, icon support, and the exact trigger behavior. Do not use the native context-menu mode unless long press is actually the desired product contract.

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
- `NativeDateTimeControl` delegates date/time selection to `@expo/ui/community/datetime-picker`.
- `GlassSurface` delegates material decisions through `AdaptiveGlass` and `AdaptiveBlur`, with the repository’s explicit Android safe-target/fallback policy.
- `AdaptiveGlass` uses `expo-glass-effect`’s `GlassView` when available on Apple platforms and approved translucent/blur fallbacks elsewhere.
- `AdaptiveBlur` is the only product-facing blur path; direct `BlurView` use is confined to that adapter. Route-local Android surfaces fall back when an explicit safe target is absent.
- `src/lib/haptics.ts` uses `expo-haptics`, including Android `performAndroidHapticsAsync`, rather than custom vibration logic.
- `Alert.alert` is a React Native bridge to platform alert/dialog behavior; no custom system-dialog recreation was found for these error/destructive flows.
- Expo Router owns the single navigation tree and route transitions; the custom bottom navigation does not create a second navigator.
- `aether-capture` owns Android share/Quick Settings and Apple share/App Intent ingress in native modules; the JS route is a review/edit screen, not a fake system share sheet.
- `expo-notifications` owns local scheduling and notification action integration; no custom replacement for the OS notification surface was found.

## Coverage notes

- `Modal`: one active React Native modal was found, the Settings model catalog. It is classified N4 because the surrounding surface manually owns sheet presentation; this is not a claim that the React Native `Modal` host itself is pure JS.
- `Switch`: there is no React Native `Switch` usage. `ToggleSwitch` is a custom semantic switch and is the N3 finding.
- `Picker`: the reusable implementation is custom and is the N4 finding. The SDK 57 native Universal Picker is not currently used.
- Segmented controls: the Settings theme selector is classified N5 as a branded AETHER mode chooser whose pill geometry and monochrome contrast are intentional product identity. Task-editor choice pills also remain N5 because their product contract includes wrapping presets and multi-select weekdays.
- Context menus: the reusable AETHER menu files are not currently consumed according to graph and literal search. No active long-press/context-menu surface was found.
- Date/time: `NativeDateTimeControl` is already native-backed. Surrounding date/time preset pills remain product-owned.
- Gestures: no `GestureDetector`, `PanResponder`, or manual pan/responder physics were found in the audited product UI. Reanimated remains in product motion, the custom AssistantSheet, task completion feedback, navigation indicator, and custom switch.
- Keyboard: `KeyboardAvoidingView` appears in the task editor and capture route; keyboard listeners appear in the custom bottom navigation and AssistantHost. The native-presentation IME seam is the single N6 runtime finding.
- Blur/glass: no product component directly bypasses `AdaptiveBlur`; the root `BlurTargetView` is a sibling target for floating chrome, and route-local surfaces use the approved fallback when no safe target is passed. No statically visible recursive target hierarchy was found.
- Sharing and pickers: there is no `expo-sharing`, `expo-document-picker`, or `expo-image-picker` dependency/usage. Incoming share/capture ingress is native-backed in `modules/aether-capture`.
- Platform forks: inline `Platform.OS` branches exist for native adapters and platform-specific product geometry; no `.ios.tsx`, `.android.tsx`, or `.native.tsx` UI fork was found.
- Accessibility: custom controls generally expose roles/state, but the N3/N4 findings are precisely the places where native control/menu semantics could replace manually maintained semantics. Native migration must still preserve AETHER labels, hints, and error/live-region behavior.

## Migration roadmap

This roadmap is conservative and audit-only. Each item is independently testable and should be a separate commit. No item was implemented in this audit.

### Wave 0 — hazards and evidence only

- Validate the N6 IME/back seam for `TaskEditorSheet`, `AssistantHost`, and `AssistantSheet` on physical Android, iPhone, and iPad where available.
- Validate the existing `BlurTargetView` sibling hierarchy around `Tabs`, `AppBottomNavigation`, `AssistantHost`, menus, sheets, and route transitions. Keep `AdaptiveBlur` as the only product-facing blur path.
- Capture Android logcat around overlay mount/unmount, native view lifecycle, Reanimated, and back handling before changing any overlay.

### Wave 1 — low-risk/high-value primitives

- `Picker`: introduce a semantic adapter around SDK 57 Universal Picker for the recurrence/priority fields, after approving the iOS menu-versus-segmented contract.
- `ToggleSwitch`: evaluate the Universal Switch for the four Settings rows, preserving the AETHER settings row and haptic policy.

### Wave 2 — moderate coupling

- `AetherContextMenu` / `AetherQuickActionsMenu`: first confirm whether the currently unconsumed exports remain product scope; if retained, evaluate SDK 57 community Menu against the actual trigger and icon contract.
- Re-run the N6 keyboard/back checks after any Wave 1 control changes because Settings and task-editor focus paths are shared with global chrome and AssistantHost.

### Wave 3 — high-risk/platform-sensitive

- Settings model catalog modal: evaluate a dedicated Expo Router `formSheet` route, preserving async catalog state, search, selection, and settings-store updates.
- Validate iPadOS form-sheet/popover adaptation, Android predictive back, IME resize, route restoration, and native build behavior before any implementation decision.

### Keep custom

- `AssistantSheet` Class C and its voice/conversation/confirmation internals.
- `AppBottomNavigation`, `AetherComposer`, AETHER toolbars, cards, task cells, recovery/attention surfaces, task completion affordance, domain choice pills, banners, and voice meter.
- Settings theme preference selector (branded OLED mode chooser).
- `TextField` and normal-route `KeyboardAvoidingView` unless runtime evidence identifies a concrete duplication or defect.
- `GlassSurface`, `AdaptiveBlur`, and `AdaptiveGlass` architecture; do not bypass their safety policy or introduce direct product `BlurView` usage.

## Validation

Only the audit document was created. Application/runtime code, dependencies, configuration, migrations, and native modules were not modified.

Validation required for this documentation-only task:

- `git diff --check`
- Repository Markdown checks, if configured

Physical Android/iPhone/iPad runtime validation was not performed as part of this audit. The report distinguishes statically established architecture from the N6 runtime seams and the existing device/build gates recorded in `docs/KNOWN_TRADEOFFS.md`.
