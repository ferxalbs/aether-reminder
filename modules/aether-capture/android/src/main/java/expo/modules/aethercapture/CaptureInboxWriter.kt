package expo.modules.aethercapture

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

internal object CaptureInboxWriter {
  const val databaseName = "aether_capture_ingress.sqlite"

  private fun open(context: Context): SQLiteDatabase {
    val database = SQLiteDatabase.openOrCreateDatabase(context.getDatabasePath(databaseName), null)
    database.execSQL("PRAGMA journal_mode=WAL")
    database.execSQL("PRAGMA busy_timeout=3000")
    database.execSQL(
      """CREATE TABLE IF NOT EXISTS capture_envelopes (
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
      )""".trimIndent()
    )
    database.execSQL(
      "CREATE INDEX IF NOT EXISTS idx_capture_envelopes_drain ON capture_envelopes(state, review_required, created_at)"
    )
    database.execSQL(
      """CREATE TABLE IF NOT EXISTS capture_events (
        id TEXT PRIMARY KEY NOT NULL, capture_id TEXT NOT NULL, name TEXT NOT NULL,
        ingress TEXT NOT NULL, payload_kind TEXT NOT NULL, metadata_json TEXT, created_at TEXT NOT NULL
      )""".trimIndent()
    )
    database.execSQL("PRAGMA user_version=1")
    return database
  }

  fun persist(context: Context, captureId: String, ingress: String, parts: JSONArray) {
    val now = java.time.Instant.now().toString()
    val database = open(context)
    try {
      database.beginTransaction()
      database.execSQL(
        """INSERT OR IGNORE INTO capture_envelopes (
          id, ingress, parts_json, created_at, idempotency_key, state, review_required,
          committed_task_id, attempts, claim_token, claimed_at, last_error_category, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', 1, NULL, 0, NULL, NULL, NULL, ?)""".trimIndent(),
        arrayOf(captureId, ingress, parts.toString(), now, captureId, now)
      )
      database.setTransactionSuccessful()
    } finally {
      if (database.inTransaction()) database.endTransaction()
      database.close()
    }
  }

  fun imagePart(assetRef: String, mimeType: String, sizeBytes: Long, displayName: String?): JSONObject =
    JSONObject()
      .put("kind", "image")
      .put("assetRef", assetRef)
      .put("mimeType", mimeType)
      .put("sizeBytes", sizeBytes)
      .apply { if (!displayName.isNullOrBlank()) put("displayName", displayName.take(180)) }

  fun textPart(text: String): JSONObject = JSONObject().put("kind", "text").put("text", text)
  fun urlPart(url: String): JSONObject = JSONObject().put("kind", "url").put("url", url)

  fun pendingAssetDirectory(context: Context, captureId: String): File =
    File(context.filesDir, "capture-assets/pending/$captureId").also { it.mkdirs() }
}
