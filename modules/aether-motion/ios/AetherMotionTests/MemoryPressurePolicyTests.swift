import XCTest

final class MemoryPressurePolicyTests: XCTestCase {
  func testCooldownIsNamedAndFinite() {
    XCTAssertEqual(MemoryPressurePolicy.cooldownMs, 180_000)
    XCTAssertGreaterThan(MemoryPressurePolicy.cooldownMs, 0)
  }

  func testActiveUntilExpiryThenRecovers() {
    let now: Double = 1_000
    let until = MemoryPressurePolicy.extend(nowMs: now)
    XCTAssertTrue(MemoryPressurePolicy.isActive(nowMs: now, untilMs: until))
    XCTAssertTrue(MemoryPressurePolicy.isActive(nowMs: until - 1, untilMs: until))
    XCTAssertFalse(MemoryPressurePolicy.isActive(nowMs: until, untilMs: until))
    XCTAssertFalse(MemoryPressurePolicy.isActive(nowMs: until + 1, untilMs: until))
    XCTAssertFalse(MemoryPressurePolicy.isActive(nowMs: now, untilMs: nil))
  }

  func testInvalidTimesAreInactive() {
    XCTAssertFalse(MemoryPressurePolicy.isActive(nowMs: .nan, untilMs: 10))
    XCTAssertFalse(MemoryPressurePolicy.isActive(nowMs: 10, untilMs: .infinity))
  }
}
