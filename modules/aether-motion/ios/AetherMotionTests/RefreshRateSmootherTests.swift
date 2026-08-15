import XCTest

final class RefreshRateSmootherTests: XCTestCase {
  func testSingleAnomalousSampleDoesNotDominate() {
    let smoother = RefreshRateSmoother(capacity: 5)
    XCTAssertEqual(smoother.push(120) ?? -1, 120, accuracy: 0.001)
    XCTAssertEqual(smoother.push(120) ?? -1, 120, accuracy: 0.001)
    XCTAssertEqual(smoother.push(120) ?? -1, 120, accuracy: 0.001)
    XCTAssertEqual(smoother.push(24) ?? -1, 120, accuracy: 0.001)
    XCTAssertEqual(smoother.push(120) ?? -1, 120, accuracy: 0.001)
  }

  func testSustainedCadenceChangeIsVisible() {
    let smoother = RefreshRateSmoother(capacity: 5)
    _ = smoother.push(120)
    _ = smoother.push(120)
    _ = smoother.push(60)
    _ = smoother.push(60)
    _ = smoother.push(60)
    XCTAssertEqual(smoother.current() ?? -1, 60, accuracy: 0.001)
  }

  func testInvalidSamplesAreIgnored() {
    let smoother = RefreshRateSmoother(capacity: 3)
    XCTAssertNil(smoother.push(0))
    XCTAssertNil(smoother.push(-30))
    XCTAssertNil(smoother.push(.nan))
    XCTAssertEqual(smoother.push(90) ?? -1, 90, accuracy: 0.001)
  }

  func testResetClearsBoundedBuffer() {
    let smoother = RefreshRateSmoother(capacity: 3)
    _ = smoother.push(120)
    smoother.reset()
    XCTAssertNil(smoother.current())
  }
}
