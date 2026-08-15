import Foundation

struct FrameWindow {
  let sampleWindowMs: Double
  let frameCount: Int
  let jankCount: Int
  let jankRatio: Double?
  let averageFrameDurationMs: Double?
  let frameOverrunP95Ms: Double?
}

final class FrameAggregator {
  private let capacity: Int
  private var frameCount = 0
  private var jankCount = 0
  private var durationSumMs = 0.0
  private var durationSamples = 0
  private var overrunsMs: [Double]
  private var overrunCount = 0
  private var overrunIndex = 0
  private var windowStartMs: Double = 0

  init(capacity: Int = 64) {
    self.capacity = capacity
    self.overrunsMs = Array(repeating: 0, count: capacity)
  }

  func reset(nowMs: Double) {
    frameCount = 0
    jankCount = 0
    durationSumMs = 0
    durationSamples = 0
    overrunCount = 0
    overrunIndex = 0
    windowStartMs = nowMs
  }

  func record(durationMs: Double?, isJank: Bool, overrunMs: Double?) {
    frameCount += 1
    if isJank {
      jankCount += 1
    }
    if let durationMs, durationMs >= 0 {
      durationSumMs += durationMs
      durationSamples += 1
    }
    if let overrunMs {
      overrunsMs[overrunIndex] = overrunMs
      overrunIndex = (overrunIndex + 1) % capacity
      if overrunCount < capacity {
        overrunCount += 1
      }
    }
  }

  func snapshot(nowMs: Double) -> FrameWindow {
    let windowMs = max(0, nowMs - windowStartMs)
    let ratio = frameCount > 0 ? Double(jankCount) / Double(frameCount) : nil
    let average = durationSamples > 0 ? durationSumMs / Double(durationSamples) : nil
    return FrameWindow(
      sampleWindowMs: windowMs,
      frameCount: frameCount,
      jankCount: jankCount,
      jankRatio: ratio,
      averageFrameDurationMs: average,
      frameOverrunP95Ms: percentileMs(95)
    )
  }

  func snapshotAndReset(nowMs: Double) -> FrameWindow {
    let window = snapshot(nowMs: nowMs)
    reset(nowMs: nowMs)
    return window
  }

  func percentileMs(_ percentile: Int) -> Double? {
    guard overrunCount > 0 else { return nil }
    let values = Array(overrunsMs.prefix(overrunCount)).sorted()
    let rank = min(max(Int(ceil(Double(percentile) / 100.0 * Double(overrunCount))) - 1, 0), overrunCount - 1)
    return values[rank]
  }
}
