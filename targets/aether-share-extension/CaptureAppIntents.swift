import AppIntents
import Foundation

@available(iOS 16.0, *)
struct CaptureWithAetherIntent: AppIntent {
  static let title: LocalizedStringResource = "Capture with AETHER"
  static let description = IntentDescription("Privately saves text to AETHER's local capture inbox.")

  @Parameter(
    title: "Text",
    requestValueDialog: IntentDialog("What should AETHER remember?")
  )
  var text: String

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalized.isEmpty, normalized.count <= CaptureInboxWriter.maxTextLength else {
      throw CaptureIngressWriterError.invalidPayload
    }
    _ = try CaptureInboxWriter.persist(
      ingress: "ios_app_intent",
      parts: [["kind": "text", "text": normalized]]
    )
    return .result(dialog: "Saved to AETHER")
  }
}

#if compiler(>=6.2)
@available(iOS 26.0, *)
extension CaptureWithAetherIntent {
  static var supportedModes: IntentModes { [.background] }
}
#endif

@available(iOS 16.0, *)
struct AetherAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: CaptureWithAetherIntent(),
      phrases: [
        "Capture with \(.applicationName)",
        "Add to \(.applicationName)",
      ],
      shortTitle: "Capture with AETHER",
      systemImageName: "tray.and.arrow.down"
    )
  }
}
