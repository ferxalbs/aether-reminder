import XCTest

final class CadenceTelemetryTests: XCTestCase {
  func testScheduledIntervalOf120Hz() {
    let interval = CadenceTelemetry.scheduledIntervalSeconds(
      timestamp: 10,
      targetTimestamp: 10 + 1.0 / 120.0
    )
    XCTAssertEqual(interval ?? -1, 1.0 / 120.0, accuracy: 0.000_000_1)
    XCTAssertEqual(CadenceTelemetry.cadenceHz(intervalSeconds: interval!) ?? -1, 120, accuracy: 0.000_1)
  }

  func testScheduledIntervalOf60Hz() {
    let interval = CadenceTelemetry.scheduledIntervalSeconds(
      timestamp: 4,
      targetTimestamp: 4 + 1.0 / 60.0
    )
    XCTAssertEqual(interval ?? -1, 1.0 / 60.0, accuracy: 0.000_000_1)
    XCTAssertEqual(CadenceTelemetry.cadenceHz(intervalSeconds: interval!) ?? -1, 60, accuracy: 0.000_1)
  }

  func testInvalidTimestampsYieldNoCadence() {
    XCTAssertNil(CadenceTelemetry.scheduledIntervalSeconds(timestamp: 5, targetTimestamp: 5))
    XCTAssertNil(CadenceTelemetry.scheduledIntervalSeconds(timestamp: 5, targetTimestamp: 4))
    XCTAssertNil(CadenceTelemetry.cadenceHz(intervalSeconds: 0))
    XCTAssertNil(CadenceTelemetry.cadenceHz(intervalSeconds: -1))
    XCTAssertNil(CadenceTelemetry.cadenceHz(intervalSeconds: .nan))
    XCTAssertNil(CadenceTelemetry.cadenceHz(intervalSeconds: .infinity))
  }

  func testProMotion60On120IsNotJank() {
    XCTAssertFalse(CadenceTelemetry.cadenceDifferenceIsJank(maximumHz: 120, scheduledHz: 60))
  }

  func testProMotion80On120IsNotJank() {
    XCTAssertFalse(CadenceTelemetry.cadenceDifferenceIsJank(maximumHz: 120, scheduledHz: 80))
  }

  func testLowPowerModeCadenceIsNotJankByDefinition() {
    XCTAssertFalse(CadenceTelemetry.cadenceDifferenceIsJank(maximumHz: 120, scheduledHz: 60))
    XCTAssertFalse(
      CadenceTelemetry.isCallbackLate(
        delaySeconds: 1.0 / 60.0,
        scheduledIntervalSeconds: 1.0 / 60.0
      )
    )
  }

  func testCallbackLatenessUsesScheduledIntervalNotMaximum() {
    let scheduled60 = 1.0 / 60.0
    XCTAssertFalse(
      CadenceTelemetry.isCallbackLate(
        delaySeconds: scheduled60,
        scheduledIntervalSeconds: scheduled60
      )
    )
    XCTAssertTrue(
      CadenceTelemetry.isCallbackLate(
        delaySeconds: scheduled60 * 1.6,
        scheduledIntervalSeconds: scheduled60
      )
    )
    XCTAssertFalse(CadenceTelemetry.cadenceDifferenceIsJank(maximumHz: 120, scheduledHz: 60))
  }

  func testCallbackDelayFromPreviousTarget() {
    let delay = CadenceTelemetry.callbackDelaySeconds(
      previousTargetTimestamp: 1.0,
      currentTimestamp: 1.012
    )
    XCTAssertEqual(delay ?? -1, 0.012, accuracy: 0.000_000_1)
    XCTAssertNil(CadenceTelemetry.callbackDelaySeconds(previousTargetTimestamp: nil, currentTimestamp: 1))
  }
}
