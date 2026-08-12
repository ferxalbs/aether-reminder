# Smart Recovery v1 manual validation

Automated checks cover deterministic domain behavior and command/repository
rollback. Physical-device validation was not performed as part of this change.
Do not mark a checkbox complete without observing the behavior on the named
runtime.

## Android

- [ ] Compact phone layout shows the small “things slipped” summary only when
      candidates exist.
- [ ] Recovery review opens, shows previous/proposed schedules and reasons,
      allows alternatives and exclusion, and applies with one primary action.
- [ ] Put the app in the background, return to the foreground, and confirm a
      fresh plan is derived without polling or a background worker.
- [ ] Apply a timed recovery with notifications enabled; confirm the desired
      reminder is reprojected through the reliability path.
- [ ] Repeat Apply Recovery; confirm no duplicate task event, reminder, or
      recurrence advancement is created.
- [ ] Use Undo; confirm each recovered schedule returns to its prior value.
- [ ] Force-stop/restart the process; confirm the next plan comes from SQLite
      and does not repeat an already-applied recovery.
- [ ] Exercise Android Back while the review surface is visible and confirm it
      dismisses only the visible surface.

## iPhone

- [ ] Confirm the same functional candidate, review, apply, stale-skip, and
      Undo behavior on a compact iPhone window.
- [ ] Verify timed recovery with notification permission enabled and denied;
      domain recovery must remain truthful when native projection is blocked.
- [ ] Confirm foreground/background return repairs the projection without
      requiring continuous execution.
- [ ] Confirm the notification category/actions remain compatible with the
      existing notification action path.

## iPadOS

- [ ] Portrait: confirm the review surface is bounded and not a stretched
      phone-width card.
- [ ] Landscape: confirm the bounded panel remains usable and centered.
- [ ] Reduced-width Split View/Stage Manager: confirm the layout adapts without
      clipping, overflow, or assuming iPhone geometry.
- [ ] Larger window: confirm task cards and the recovery review remain within
      readable max widths.
- [ ] Confirm keyboard focus/input behavior where the surrounding task editor
      or composer is used with Recovery.
- [ ] Confirm notification actions and Undo behavior match the iPhone flow.

## Non-deploying checks

Run from the repository:

```bash
bun test
bun run typecheck
bun run lint
bunx expo config --type public
bunx expo export --platform android --platform ios --output-dir /tmp/aether-reminder-smart-recovery-export
```

An Android development EAS build remains required by the repository policy for
native runtime changes before device validation. This milestone did not deploy,
publish, submit, or add production credentials. The build was attempted during
implementation, but the configured Expo account had exhausted its monthly
free-plan Android build quota; retry it after quota availability returns.
