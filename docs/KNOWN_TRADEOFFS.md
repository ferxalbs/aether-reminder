# Known Tradeoffs

## Notification reconciliation batch size

`NOTIFICATION_RECONCILIATION_BATCH_SIZE` is set to `8` in
`src/services/notifications/localNotificationProjection.ts:86`.

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
