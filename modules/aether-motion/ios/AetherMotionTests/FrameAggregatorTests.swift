import XCTest

final class FrameAggregatorTests: XCTestCase {
  func testEmptyWindowHasNullRatios() {
    let aggregator = FrameAggregator()
    aggregator.reset(nowMs: 0)
    let window = aggregator.snapshot(nowMs: 750)
    XCTAssertEqual(window.sampleWindowMs, 750)
    XCTAssertEqual(window.frameCount, 0)
    XCTAssertNil(window.jankRatio)
    XCTAssertNil(window.averageFrameDurationMs)
    XCTAssertNil(window.frameOverrunP95Ms)
  }

  func testJankRatioAndAverage() {
    let aggregator = FrameAggregator()
    aggregator.reset(nowMs: 0)
    aggregator.record(durationMs: 8, isJank: false, overrunMs: 0)
    aggregator.record(durationMs: 20, isJank: true, overrunMs: 4)
    let window = aggregator.snapshot(nowMs: 750)
    XCTAssertEqual(window.frameCount, 2)
    XCTAssertEqual(window.jankCount, 1)
    XCTAssertEqual(window.jankRatio ?? -1, 0.5, accuracy: 0.0001)
    XCTAssertEqual(window.averageFrameDurationMs ?? -1, 14, accuracy: 0.0001)
  }

  func testBoundedPercentile() {
    let aggregator = FrameAggregator(capacity: 4)
    aggregator.reset(nowMs: 0)
    aggregator.record(durationMs: 8, isJank: false, overrunMs: 1)
    aggregator.record(durationMs: 8, isJank: false, overrunMs: 2)
    aggregator.record(durationMs: 8, isJank: false, overrunMs: 3)
    aggregator.record(durationMs: 8, isJank: false, overrunMs: 4)
    aggregator.record(durationMs: 8, isJank: false, overrunMs: 10)
    XCTAssertEqual(aggregator.percentileMs(95) ?? -1, 10, accuracy: 0.0001)
  }
}
