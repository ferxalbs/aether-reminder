import Foundation

enum ThermalMapper {
  static func fromProcessInfo(_ state: ProcessInfo.ThermalState?) -> String {
    guard let state else { return "unknown" }
    switch state {
    case .nominal:
      return "nominal"
    case .fair:
      return "fair"
    case .serious:
      return "serious"
    case .critical:
      return "critical"
    @unknown default:
      return "unknown"
    }
  }

  static func fromRawValue(_ rawValue: Int) -> String {
    fromProcessInfo(ProcessInfo.ThermalState(rawValue: rawValue))
  }
}
