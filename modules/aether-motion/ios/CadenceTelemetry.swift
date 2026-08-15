import Foundation

/// Pure cadence helpers. These never treat panel maximum as required FPS.
enum CadenceTelemetry {
  /// Scheduled display interval from CADisplayLink timestamps.
  static func scheduledIntervalSeconds(
    timestamp: Double,
    targetTimestamp: Double
  ) -> Double? {
    let interval = targetTimestamp - timestamp
    guard interval.isFinite, interval > 0 else { return nil }
    return interval
  }

  static func cadenceHz(intervalSeconds: Double) -> Double? {
    guard intervalSeconds.isFinite, intervalSeconds > 0 else { return nil }
    let hz = 1.0 / intervalSeconds
    guard hz.isFinite, hz > 0 else { return nil }
    return hz
  }

  /// Delay of this callback relative to the previously scheduled target.
  /// Positive means the callback arrived after that target.
  static func callbackDelaySeconds(
    previousTargetTimestamp: Double?,
    currentTimestamp: Double
  ) -> Double? {
    guard let previousTargetTimestamp, currentTimestamp.isFinite else { return nil }
    let delay = currentTimestamp - previousTargetTimestamp
    guard delay.isFinite else { return nil }
    return delay
  }

  /// Delivery is late only relative to the OS-scheduled interval.
  /// Never compare against the panel's maximum refresh interval.
  static func isCallbackLate(
    delaySeconds: Double,
    scheduledIntervalSeconds: Double,
    factor: Double = 1.5
  ) -> Bool {
    guard delaySeconds.isFinite, scheduledIntervalSeconds.isFinite, scheduledIntervalSeconds > 0 else {
      return false
    }
    return delaySeconds > scheduledIntervalSeconds * factor
  }

  /// A lower scheduled cadence than the panel maximum is never jank by itself.
  static func cadenceDifferenceIsJank(maximumHz: Double, scheduledHz: Double) -> Bool {
    _ = maximumHz
    _ = scheduledHz
    return false
  }
}
