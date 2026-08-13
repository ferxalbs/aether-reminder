import ExpoModulesCore
import Foundation

private let captureAppGroup = "group.com.ferxalbs.aetherreminder.capture"

public final class AetherCaptureModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AetherCapture")
    Events("onCaptureReceived")

    Function("getCapabilities") {
      return [
        "shareReceive": true,
        "quickSettings": false,
        "appShortcut": true,
        "appIntent": true,
        "shareExtension": true,
      ]
    }

    Function("getSharedContainerDirectory") { () -> String? in
      Self.containerURL()?.absoluteString
    }

    Function("getPendingRouteCaptureId") { () -> String? in nil }
    Function("getPendingLaunchIngress") { () -> String? in nil }
    Function("clearPendingRouteCaptureId") { (_: String) in }

    AsyncFunction("adoptImageAsset") { (assetRef: String, captureId: String) async throws -> String in
      try Self.adoptImageAsset(assetRef: assetRef, captureId: captureId)
    }

    AsyncFunction("discardCaptureAssets") { (captureId: String) async throws in
      guard let container = Self.containerURL() else { return }
      let pending = container
        .appendingPathComponent("capture-assets", isDirectory: true)
        .appendingPathComponent("pending", isDirectory: true)
        .appendingPathComponent(captureId, isDirectory: true)
      try? FileManager.default.removeItem(at: pending)
      let committed = container
        .appendingPathComponent("capture-assets", isDirectory: true)
        .appendingPathComponent("committed", isDirectory: true)
        .appendingPathComponent(captureId, isDirectory: true)
      try? FileManager.default.removeItem(at: committed)
    }
  }

  private static func containerURL() -> URL? {
    FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: captureAppGroup
    )
  }

  private static func adoptImageAsset(assetRef: String, captureId: String) throws -> String {
    guard let container = containerURL(), let sourceURL = URL(string: assetRef), sourceURL.isFileURL else {
      throw NSError(domain: "AetherCapture", code: 1, userInfo: [
        NSLocalizedDescriptionKey: "Capture asset is unavailable.",
      ])
    }
    let root = container.appendingPathComponent("capture-assets", isDirectory: true).standardizedFileURL
    let pending = root
      .appendingPathComponent("pending", isDirectory: true)
      .appendingPathComponent(captureId, isDirectory: true)
      .standardizedFileURL
    let committed = root
      .appendingPathComponent("committed", isDirectory: true)
      .appendingPathComponent(captureId, isDirectory: true)
      .standardizedFileURL
    let source = sourceURL.standardizedFileURL
    guard source.path.hasPrefix(pending.path + "/") || source.path.hasPrefix(committed.path + "/") else {
      throw NSError(domain: "AetherCapture", code: 2, userInfo: [
        NSLocalizedDescriptionKey: "Capture asset is outside AETHER-managed storage.",
      ])
    }
    if source.path.hasPrefix(committed.path + "/") { return source.absoluteString }
    try FileManager.default.createDirectory(at: committed, withIntermediateDirectories: true)
    let destination = committed.appendingPathComponent(source.lastPathComponent)
    if !FileManager.default.fileExists(atPath: destination.path) {
      guard FileManager.default.fileExists(atPath: source.path) else {
        throw NSError(domain: "AetherCapture", code: 3, userInfo: [
          NSLocalizedDescriptionKey: "Capture asset is no longer available.",
        ])
      }
      try FileManager.default.moveItem(at: source, to: destination)
    }
    try? FileManager.default.removeItem(at: pending)
    return destination.absoluteString
  }
}
