import Foundation

/// AETHER policy for iOS memory warnings. Not an Apple API contract.
enum MemoryPressurePolicy {
  /// Temporary ceiling reduction after a memory warning. Several minutes
  /// lets the allocator settle without latching for the whole session.
  static let cooldownMs: Double = 180_000

  static func isActive(nowMs: Double, untilMs: Double?) -> Bool {
    guard let untilMs, nowMs.isFinite, untilMs.isFinite else { return false }
    return nowMs < untilMs
  }

  static func extend(nowMs: Double, cooldownMs: Double = cooldownMs) -> Double {
    nowMs + cooldownMs
  }
}
