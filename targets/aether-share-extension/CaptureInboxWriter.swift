import Foundation
import SQLite3

enum CaptureIngressWriterError: LocalizedError {
  case appGroupUnavailable
  case invalidPayload
  case database(String)

  var errorDescription: String? {
    switch self {
    case .appGroupUnavailable: return "AETHER shared storage is unavailable."
    case .invalidPayload: return "This item cannot be saved to AETHER."
    case .database: return "AETHER could not safely own this capture."
    }
  }
}

enum CaptureInboxWriter {
  static let appGroup = "group.com.ferxalbs.aetherreminder.capture"
  static let databaseName = "aether_capture_ingress.sqlite"
  static let maxTextLength = 10_000
  static let maxImageBytes: Int64 = 15 * 1024 * 1024

  static func containerURL() throws -> URL {
    guard let url = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroup
    ) else { throw CaptureIngressWriterError.appGroupUnavailable }
    return url
  }

  static func pendingAssetDirectory(captureId: String) throws -> URL {
    let directory = try containerURL()
      .appendingPathComponent("capture-assets", isDirectory: true)
      .appendingPathComponent("pending", isDirectory: true)
      .appendingPathComponent(captureId, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }

  static func persist(
    captureId: String = UUID().uuidString.lowercased(),
    ingress: String,
    parts: [[String: Any]],
    reviewRequired: Bool = false
  ) throws -> String {
    guard !parts.isEmpty, JSONSerialization.isValidJSONObject(parts) else {
      throw CaptureIngressWriterError.invalidPayload
    }
    let payload = try JSONSerialization.data(withJSONObject: parts)
    guard let payloadJSON = String(data: payload, encoding: .utf8) else {
      throw CaptureIngressWriterError.invalidPayload
    }
    let databaseURL = try containerURL().appendingPathComponent(databaseName)
    var database: OpaquePointer?
    guard sqlite3_open_v2(
      databaseURL.path,
      &database,
      SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX,
      nil
    ) == SQLITE_OK, let database else {
      throw CaptureIngressWriterError.database("open")
    }
    defer { sqlite3_close(database) }
    sqlite3_busy_timeout(database, 3_000)
    try execute(database, sql: "PRAGMA journal_mode=WAL")
    try execute(database, sql: "PRAGMA busy_timeout=3000")
    try execute(database, sql: """
      CREATE TABLE IF NOT EXISTS capture_envelopes (
        id TEXT PRIMARY KEY NOT NULL,
        ingress TEXT NOT NULL,
        parts_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL CHECK (state IN ('pending','processing','committed','discarded','failed_retryable','failed_terminal')),
        review_required INTEGER NOT NULL DEFAULT 0 CHECK (review_required IN (0,1)),
        committed_task_id TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        claim_token TEXT,
        claimed_at TEXT,
        last_error_category TEXT,
        updated_at TEXT NOT NULL
      )
      """)
    try execute(database, sql: "CREATE INDEX IF NOT EXISTS idx_capture_envelopes_drain ON capture_envelopes(state, review_required, created_at)")
    try execute(database, sql: """
      CREATE TABLE IF NOT EXISTS capture_events (
        id TEXT PRIMARY KEY NOT NULL, capture_id TEXT NOT NULL, name TEXT NOT NULL,
        ingress TEXT NOT NULL, payload_kind TEXT NOT NULL, metadata_json TEXT, created_at TEXT NOT NULL
      )
      """)
    try execute(database, sql: "PRAGMA user_version=1")

    let now = ISO8601DateFormatter().string(from: Date())
    let sql = """
      INSERT OR IGNORE INTO capture_envelopes (
        id, ingress, parts_json, created_at, idempotency_key, state, review_required,
        committed_task_id, attempts, claim_token, claimed_at, last_error_category, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL, 0, NULL, NULL, NULL, ?)
      """
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
          let statement else {
      throw CaptureIngressWriterError.database("prepare")
    }
    defer { sqlite3_finalize(statement) }
    bind(captureId, to: 1, statement: statement)
    bind(ingress, to: 2, statement: statement)
    bind(payloadJSON, to: 3, statement: statement)
    bind(now, to: 4, statement: statement)
    bind(captureId, to: 5, statement: statement)
    sqlite3_bind_int(statement, 6, reviewRequired ? 1 : 0)
    bind(now, to: 7, statement: statement)
    guard sqlite3_step(statement) == SQLITE_DONE else {
      throw CaptureIngressWriterError.database("insert")
    }
    return captureId
  }

  private static func execute(_ database: OpaquePointer, sql: String) throws {
    var error: UnsafeMutablePointer<CChar>?
    guard sqlite3_exec(database, sql, nil, nil, &error) == SQLITE_OK else {
      if let error { sqlite3_free(error) }
      throw CaptureIngressWriterError.database("schema")
    }
  }

  private static func bind(_ value: String, to index: Int32, statement: OpaquePointer) {
    let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    sqlite3_bind_text(statement, index, value, -1, transient)
  }
}
