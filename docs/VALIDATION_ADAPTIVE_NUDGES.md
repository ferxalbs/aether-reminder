# Adaptive Nudge Engine v1 Validation

This document is a physical-device checklist. It does not claim that a full
platform matrix has passed; the evidence table distinguishes user-reported
validation from reproducible device records.

## Static and build checks

Run from the repository root:

```bash
bun test
bun run typecheck
bun run lint
bunx expo config --type public
```

The app should be checked for both Android and iOS configuration/export paths.
Do not add production credentials, deploy, publish, or submit during this
validation.

## Android matrix

Record at least one Pixel/stock Android device, one Samsung/One UI device, and
one aggressively managed OEM when available. For each device, record model,
Android version, app build, notification permission state, battery/background
restrictions, and channel settings.

- [ ] Adaptive Nudges is visibly opt-in in Settings and explains local learning.
- [ ] Enabling creates no immediate notification storm and disabling cancels
      derived follow-ups while primary reminders remain intact.
- [ ] `aether-reminders` and `aether-adaptive-reminders` are stable channels;
      repeated replans do not create new channels or raise importance.
- [ ] Adaptive follow-up is lower pressure than a primary reminder and respects
      user channel settings.
- [ ] Revoke and restore notification permission; verify SQLite nudge intent
      remains and reliability repair schedules it after permission returns.
- [ ] Background app, force-stop/process-killed app, cold launch, and reboot;
      verify the bounded learned follow-up projection is repaired.
- [ ] Tap Complete, Snooze, and Tomorrow from a notification, including a cold
      action; verify recurrence and task schedule semantics.
- [ ] Deliver the same action response twice; verify one domain mutation and
      one behavioral event.
- [ ] Create many unfinished tasks; verify the per-task/global budget and no
      notification storm.
- [ ] Complete, delete, manually reschedule, and Smart-Recover a task; verify
      stale adaptive notifications are cancelled.

## iPhone matrix

- [ ] Test notification permission granted, denied, and askable states.
- [ ] Test Complete, Snooze, Tomorrow, explicit notification tap, and duplicate
      response protection in foreground, background, and terminated/reopened
      states.
- [ ] Verify gentle adaptive follow-ups use passive/silent presentation and do
      not become Time Sensitive or Critical Alerts.
- [ ] Verify learned follow-up projection, local budget, completion cancellation,
      Smart Recovery handoff, and recurrence behavior.
- [ ] Change timezone while a floating and a fixed task are pending; verify the
      floating plan is regenerated and fixed semantics remain anchored.

## iPadOS matrix

- [ ] Repeat the iPhone domain and notification tests on a physical iPad where
      available.
- [ ] Verify the planner, budgets, learning, recurrence, action idempotency,
      and Smart Recovery handoff are identical to iPhone.
- [ ] Verify only supported native presentation differences occur; no iPad-only
      domain behavior is introduced.

## Evidence record

| Platform/device | OS build | App build | Tests run | Result | Evidence/link |
| --- | --- | --- | --- | --- | --- |
| User-reported physical device | Not provided | Not provided | Real-device testing reported by user; exact scenarios not recorded | Partial user validation; full matrix pending | — |

Static/unit validation cannot prove OEM channel behavior, process-killed cold
actions, reboot persistence, permission transitions, or real notification
delivery. Those remain release-blocking checks for a public beta or GA.
