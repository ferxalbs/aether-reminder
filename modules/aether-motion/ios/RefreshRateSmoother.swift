import Foundation

/// Bounded rolling-median smoother for observed/scheduled cadence.
/// Does not smooth maximum refresh rate. Capacity is fixed; no unbounded growth.
final class RefreshRateSmoother {
  private let capacity: Int
  private var samples: [Double]
  private var count = 0
  private var index = 0

  init(capacity: Int = 5) {
    self.capacity = max(1, capacity)
    self.samples = Array(repeating: 0, count: self.capacity)
  }

  @discardableResult
  func push(_ hz: Double) -> Double? {
    guard hz.isFinite, hz > 0 else { return current() }
    samples[index] = hz
    index = (index + 1) % capacity
    if count < capacity {
      count += 1
    }
    return current()
  }

  func current() -> Double? {
    guard count > 0 else { return nil }
    let values = Array(samples.prefix(count)).sorted()
    return values[count / 2]
  }

  func reset() {
    count = 0
    index = 0
  }
}
