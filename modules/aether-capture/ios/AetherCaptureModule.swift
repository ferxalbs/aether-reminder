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
      if let container = Self.containerURL() {
        let sharedRoot = container.appendingPathComponent("capture-assets", isDirectory: true)
        for state in ["pending", "committed"] {
          try? FileManager.default.removeItem(at: sharedRoot
            .appendingPathComponent(state, isDirectory: true)
            .appendingPathComponent(captureId, isDirectory: true))
        }
      }
      if let taskSources = try? Self.hostTaskSourceDirectory(captureId: captureId) {
        try? FileManager.default.removeItem(at: taskSources)
      }
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
    let sharedRoot = container.appendingPathComponent("capture-assets", isDirectory: true).standardizedFileURL
    let pending = sharedRoot
      .appendingPathComponent("pending", isDirectory: true)
      .appendingPathComponent(captureId, isDirectory: true)
      .standardizedFileURL
    let legacyCommitted = sharedRoot
      .appendingPathComponent("committed", isDirectory: true)
      .appendingPathComponent(captureId, isDirectory: true)
      .standardizedFileURL
    let taskSources = try hostTaskSourceDirectory(captureId: captureId)
    let source = sourceURL.standardizedFileURL
    let sourceIsShared = source.path.hasPrefix(pending.path + "/")
      || source.path.hasPrefix(legacyCommitted.path + "/")
    let sourceIsPrivate = source.path.hasPrefix(taskSources.path + "/")
    guard sourceIsShared || sourceIsPrivate else {
      throw NSError(domain: "AetherCapture", code: 2, userInfo: [
        NSLocalizedDescriptionKey: "Capture asset is outside AETHER-managed storage.",
      ])
    }
    if sourceIsPrivate { return source.absoluteString }

    let destination = taskSources.appendingPathComponent(source.lastPathComponent).standardizedFileURL
    if !FileManager.default.fileExists(atPath: destination.path) {
      guard FileManager.default.fileExists(atPath: source.path) else {
        throw NSError(domain: "AetherCapture", code: 3, userInfo: [
          NSLocalizedDescriptionKey: "Capture asset is no longer available.",
        ])
      }
      let temporary = taskSources.appendingPathComponent(".\(source.lastPathComponent).adopting")
      do {
        try? FileManager.default.removeItem(at: temporary)
        try FileManager.default.copyItem(at: source, to: temporary)
        try FileManager.default.moveItem(at: temporary, to: destination)
      } catch {
        try? FileManager.default.removeItem(at: temporary)
        throw error
      }
    }
    // The host-private copy is authoritative before shared storage is removed.
    try? FileManager.default.removeItem(at: source)
    try? FileManager.default.removeItem(at: pending)
    try? FileManager.default.removeItem(at: legacyCommitted)
    return destination.absoluteString
  }

  private static func hostTaskSourceDirectory(captureId: String) throws -> URL {
    guard !captureId.isEmpty, captureId.count <= 160, captureId != ".", captureId != "..",
          captureId.range(of: "^[A-Za-z0-9._:-]+$", options: .regularExpression) != nil,
          let applicationSupport = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
          ).first else {
      throw NSError(domain: "AetherCapture", code: 4, userInfo: [
        NSLocalizedDescriptionKey: "Capture destination is unavailable.",
      ])
    }
    let directory = applicationSupport
      .appendingPathComponent("AetherCapture", isDirectory: true)
      .appendingPathComponent("task-sources", isDirectory: true)
      .appendingPathComponent(captureId, isDirectory: true)
      .standardizedFileURL
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }
}
