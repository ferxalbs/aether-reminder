import SwiftUI
import UIKit
import UniformTypeIdentifiers

private enum LoadedCapturePart {
  case text(String)
  case url(String)
  case image(url: URL, mimeType: String, sizeBytes: Int64, displayName: String)
}

@MainActor
private final class ShareCaptureModel: ObservableObject {
  @Published var loading = true
  @Published var saving = false
  @Published var error: String?
  @Published var imageURL: URL?
  @Published var reminderTitle = ""
  @Published var previewText = ""

  private let extensionContext: NSExtensionContext?
  private let captureId = UUID().uuidString.lowercased()
  private var parts: [LoadedCapturePart] = []

  init(extensionContext: NSExtensionContext?) {
    self.extensionContext = extensionContext
  }

  var requiresTitle: Bool { imageURL != nil && !parts.contains(where: { if case .text = $0 { true } else { false } }) }
  var canSave: Bool { !loading && !saving && error == nil && (!requiresTitle || !reminderTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }

  func load() {
    Task {
      do {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        var providers = items.flatMap { $0.attachments ?? [] }
        for item in items {
          if let text = item.attributedContentText?.string.trimmingCharacters(in: .whitespacesAndNewlines),
             !text.isEmpty {
            parts.append(.text(text))
          }
        }
        guard !providers.isEmpty || !parts.isEmpty else { throw CaptureIngressWriterError.invalidPayload }
        // Host order is retained. Each provider contributes only its most specific supported representation.
        while !providers.isEmpty {
          let provider = providers.removeFirst()
          if let type = supportedImageType(provider) {
            guard imageURL == nil else { throw CaptureIngressWriterError.invalidPayload }
            let image = try await loadImage(provider: provider, type: type)
            imageURL = image.url
            parts.append(.image(
              url: image.url,
              mimeType: image.mimeType,
              sizeBytes: image.size,
              displayName: image.name
            ))
          } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            let url = try await loadURL(provider)
            parts.append(.url(url))
          } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            let text = try await loadText(provider)
            parts.append(.text(text))
          } else {
            throw CaptureIngressWriterError.invalidPayload
          }
        }
        guard parts.filter({ if case .image = $0 { true } else { false } }).count <= 1 else {
          throw CaptureIngressWriterError.invalidPayload
        }
        previewText = parts.compactMap {
          switch $0 {
          case .text(let text): return text
          case .url(let url): return url
          case .image: return nil
          }
        }.joined(separator: "\n")
      } catch {
        self.error = error.localizedDescription
      }
      loading = false
    }
  }

  func save() {
    guard canSave else { return }
    saving = true
    error = nil
    do {
      var encoded: [[String: Any]] = []
      let title = reminderTitle.trimmingCharacters(in: .whitespacesAndNewlines)
      if requiresTitle && !title.isEmpty {
        encoded.append(["kind": "text", "text": title])
      }
      for part in parts {
        switch part {
        case .text(let text):
          let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)
          guard !normalized.isEmpty, normalized.count <= CaptureInboxWriter.maxTextLength else {
            throw CaptureIngressWriterError.invalidPayload
          }
          encoded.append(["kind": "text", "text": normalized])
        case .url(let url):
          encoded.append(["kind": "url", "url": url])
        case .image(let url, let mimeType, let sizeBytes, let displayName):
          encoded.append([
            "kind": "image",
            "assetRef": url.absoluteString,
            "mimeType": mimeType,
            "sizeBytes": sizeBytes,
            "displayName": displayName,
          ])
        }
      }
      _ = try CaptureInboxWriter.persist(
        captureId: captureId,
        ingress: "ios_share_extension",
        parts: encoded
      )
      extensionContext?.completeRequest(returningItems: nil)
    } catch {
      self.error = error.localizedDescription
      saving = false
    }
  }

  func cancel() {
    try? FileManager.default.removeItem(at: CaptureInboxWriter.pendingAssetDirectory(captureId: captureId))
    extensionContext?.cancelRequest(withError: NSError(
      domain: "AetherCapture",
      code: NSUserCancelledError,
      userInfo: [NSLocalizedDescriptionKey: "Capture cancelled."]
    ))
  }

  private func supportedImageType(_ provider: NSItemProvider) -> UTType? {
    let supportedMimes = Set(["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"])
    return provider.registeredTypeIdentifiers
      .compactMap(UTType.init)
      .first { $0.conforms(to: .image) && $0.preferredMIMEType.map(supportedMimes.contains) == true }
  }

  private func loadText(_ provider: NSItemProvider) async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { item, error in
        if let error { continuation.resume(throwing: error); return }
        let text = (item as? String) ?? (item as? NSString).map(String.init)
        guard let normalized = text?.trimmingCharacters(in: .whitespacesAndNewlines),
              !normalized.isEmpty else {
          continuation.resume(throwing: CaptureIngressWriterError.invalidPayload)
          return
        }
        continuation.resume(returning: normalized)
      }
    }
  }

  private func loadURL(_ provider: NSItemProvider) async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: UTType.url.identifier) { item, error in
        if let error { continuation.resume(throwing: error); return }
        let url = (item as? URL) ?? (item as? NSURL).map { $0 as URL }
        guard let url, url.scheme == "http" || url.scheme == "https" else {
          continuation.resume(throwing: CaptureIngressWriterError.invalidPayload)
          return
        }
        continuation.resume(returning: url.absoluteString)
      }
    }
  }

  private func loadImage(provider: NSItemProvider, type: UTType) async throws -> (
    url: URL, mimeType: String, size: Int64, name: String
  ) {
    let destinationDirectory = try CaptureInboxWriter.pendingAssetDirectory(captureId: captureId)
    return try await withCheckedThrowingContinuation { continuation in
      provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { temporaryURL, error in
        if let error { continuation.resume(throwing: error); return }
        guard let temporaryURL, let mimeType = type.preferredMIMEType else {
          continuation.resume(throwing: CaptureIngressWriterError.invalidPayload)
          return
        }
        do {
          let values = try temporaryURL.resourceValues(forKeys: [.fileSizeKey, .nameKey])
          let size = Int64(values.fileSize ?? 0)
          guard size >= 0 && size <= CaptureInboxWriter.maxImageBytes else {
            throw CaptureIngressWriterError.invalidPayload
          }
          let ext = type.preferredFilenameExtension ?? "image"
          let destination = destinationDirectory.appendingPathComponent("source.\(ext)")
          if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
          }
          try FileManager.default.copyItem(at: temporaryURL, to: destination)
          guard Self.hasExpectedImageSignature(at: destination, mimeType: mimeType) else {
            try? FileManager.default.removeItem(at: destination)
            throw CaptureIngressWriterError.invalidPayload
          }
          continuation.resume(returning: (
            destination,
            mimeType,
            size,
            URL(fileURLWithPath: values.name ?? "source.\(ext)").lastPathComponent
          ))
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }

  private static func hasExpectedImageSignature(at url: URL, mimeType: String) -> Bool {
    guard let handle = try? FileHandle(forReadingFrom: url) else { return false }
    defer { try? handle.close() }
    guard let data = try? handle.read(upToCount: 16), let data, data.count >= 3 else { return false }
    let bytes = [UInt8](data)
    func ascii(_ offset: Int, _ value: String) -> Bool {
      let expected = [UInt8](value.utf8)
      return bytes.count >= offset + expected.count &&
        Array(bytes[offset..<(offset + expected.count)]) == expected
    }
    switch mimeType {
    case "image/jpeg": return bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff
    case "image/png":
      return bytes.count >= 8 && Array(bytes[0..<8]) == [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    case "image/webp": return ascii(0, "RIFF") && ascii(8, "WEBP")
    case "image/heic", "image/heif":
      guard ascii(4, "ftyp"), bytes.count >= 12 else { return false }
      let brand = String(bytes: bytes[8..<12], encoding: .ascii) ?? ""
      return ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].contains(brand)
    default: return false
    }
  }
}

private struct ShareCaptureView: View {
  @ObservedObject var model: ShareCaptureModel
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          if model.loading {
            ProgressView("Loading capture…")
              .frame(maxWidth: .infinity, minHeight: 180)
          } else if let error = model.error {
            Text(error)
              .foregroundStyle(.secondary)
              .accessibilityLabel("Capture error: \(error)")
          } else {
            if let imageURL = model.imageURL, let image = UIImage(contentsOfFile: imageURL.path) {
              Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(maxWidth: .infinity, maxHeight: 280)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .accessibilityLabel("Shared image preview")
            }
            if model.requiresTitle {
              Text("What should AETHER remember?")
                .font(.headline)
              TextField("Reminder", text: $model.reminderTitle, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(2...5)
                .accessibilityHint("Required before saving this image")
            } else if !model.previewText.isEmpty {
              Text(model.previewText)
                .font(.body)
                .textSelection(.enabled)
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 10)
            }
            Text("AETHER will interpret this locally when the main app is available.")
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
        }
        .frame(maxWidth: 560, alignment: .leading)
        .padding(20)
        .frame(maxWidth: .infinity)
      }
      .navigationTitle("Save to AETHER")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", action: model.cancel)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save", action: model.save)
            .disabled(!model.canSave)
        }
      }
    }
  }
}

final class ShareViewController: UIViewController {
  private var model: ShareCaptureModel?

  override func viewDidLoad() {
    super.viewDidLoad()
    let model = ShareCaptureModel(extensionContext: extensionContext)
    self.model = model
    let host = UIHostingController(rootView: ShareCaptureView(model: model))
    addChild(host)
    host.view.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(host.view)
    NSLayoutConstraint.activate([
      host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      host.view.topAnchor.constraint(equalTo: view.topAnchor),
      host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    host.didMove(toParent: self)
    model.load()
  }
}
