# Recurrence + Notification Native Validation

Before this slice is considered production-ready, validate on physical iOS and Android devices:

1. Schedule a timed reminder and confirm the notification shows `Complete`, `Snooze 10m`, and `Tomorrow` actions.
2. Use `Snooze 10m` while the app is backgrounded; verify the same reminder is re-projected for exactly ten minutes later.
3. Use `Tomorrow`; verify local date advances one day while the reminder time remains stable.
4. Use `Complete`; verify the task completes through the command layer and disappears from active Upcoming membership.
5. For a recurring task, use `Complete`; verify exactly one next occurrence is generated and its reminder is scheduled.
6. Repeat/duplicate the same response where possible; verify no duplicate recurrence occurrence is generated.
7. Undo the latest recurring completion in-app; verify the generated next occurrence is removed and the previous occurrence reopens.
8. Force-stop/relaunch after acting on a notification; verify cold-launch response recovery is idempotent.
9. Disable notification permission and verify the domain reminder persists with projection failure surfaced rather than losing task state.
10. Change timezone and foreground the app; verify reconciliation preserves floating/fixed semantics.
