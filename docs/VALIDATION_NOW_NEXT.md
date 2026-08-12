# NOW/NEXT Manual Validation

This checklist records validation that must be performed on real runtimes. A
passing unit test, typecheck, lint, or JavaScript bundle is not a physical
device result.

## Automated checks

- [x] `bun test src/domain/attentionPlanner.test.ts`
- [x] `bun test` (227 passed, 2 existing manual tests skipped)
- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bunx expo config --type public`
- [x] Repository candidate-query test with 500 local tasks returns at most 32 candidates.

## Android phone

Device/model and OS: _record before testing_

- [ ] Home cold start shows compact NOW/NEXT hierarchy.
- [ ] `Focus now` persists while navigating and does not change task schedule.
- [ ] Completing NOW promotes the derived next candidate without a promotion mutation.
- [ ] Smart Recovery appears as one alert and opens the existing Recovery surface.
- [ ] An Adaptive Nudge candidate appears when the live nudge intent is due.
- [ ] Background/foreground recomputes the plan.
- [ ] Timezone change recomputes local temporal facts.
- [ ] Large local task dataset keeps Home responsive and candidate retrieval bounded.
- [ ] Android back behavior remains unchanged for Home, Recovery, and editor surfaces.
- [ ] Capture `adb logcat` around `AndroidRuntime`, React Native, Hermes,
  Reanimated, and the app process if any native process exit occurs.

## iPhone

Device/model and OS: _record before testing_

- [ ] Equivalent NOW/NEXT decisions and focus behavior.
- [ ] Completion, Recovery, Adaptive Nudge, and foreground refresh flows.
- [ ] Dynamic type, accessibility labels, touch targets, and reduced motion.
- [ ] Portrait and landscape layout remain readable.

## iPadOS

Device/model, OS, and window configuration: _record before testing_

- [ ] Portrait layout.
- [ ] Landscape layout.
- [ ] Compact multitasking width remains usable.
- [ ] Wide window uses bounded NOW/NEXT composition without a stretched phone card.
- [ ] Keyboard focus reaches NOW, NEXT, actions, and navigation.
- [ ] Dynamic type remains readable.
- [ ] Window resize does not lose plan or focus state.

## Current status

No physical-device validation has been performed by this change set yet. The
implementation is therefore not classified above `READY FOR DEVICE VALIDATION`
until the runtime checklist is completed and recorded with actual device
evidence.
