import XCTest

final class ThermalMapperTests: XCTestCase {
  func testUnknownWhenMissing() {
    XCTAssertEqual(ThermalMapper.fromProcessInfo(nil), "unknown")
  }

  func testMapsEveryProcessInfoState() {
    XCTAssertEqual(ThermalMapper.fromProcessInfo(.nominal), "nominal")
    XCTAssertEqual(ThermalMapper.fromProcessInfo(.fair), "fair")
    XCTAssertEqual(ThermalMapper.fromProcessInfo(.serious), "serious")
    XCTAssertEqual(ThermalMapper.fromProcessInfo(.critical), "critical")
  }
}
