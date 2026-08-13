package expo.modules.aethercapture

import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.Executors

class AetherCaptureModule : Module() {
  private val executor = Executors.newSingleThreadExecutor()
  @Volatile private var pendingCaptureId: String? = null
  @Volatile private var pendingLaunchIngress: String? = null

  override fun definition() = ModuleDefinition {
    Name("AetherCapture")
    Events("onCaptureReceived")

    OnCreate {
      appContext.currentActivity?.intent?.let(::processIntent)
    }
    OnNewIntent { intent -> processIntent(intent) }
    OnDestroy { executor.shutdown() }

    Function("getCapabilities") {
      mapOf(
        "shareReceive" to true,
        "quickSettings" to true,
        "appShortcut" to true,
        "appIntent" to false,
        "shareExtension" to false,
      )
    }
    Function("getSharedContainerDirectory") { null }
    Function("getPendingRouteCaptureId") {
      appContext.currentActivity?.intent?.let(::processIntent)
      pendingCaptureId
    }
    Function("getPendingLaunchIngress") {
      appContext.currentActivity?.intent?.let(::processIntent)
      pendingLaunchIngress
    }
    Function("clearPendingRouteCaptureId") { captureId: String ->
      if (pendingCaptureId == captureId) pendingCaptureId = null
    }
    AsyncFunction("adoptImageAsset") { assetRef: String, captureId: String ->
      adoptImageAsset(assetRef, captureId)
    }
    AsyncFunction("discardCaptureAssets") { captureId: String ->
      discardCaptureAssets(captureId)
    }
  }

  private fun processIntent(intent: Intent) {
    if (intent.action == Intent.ACTION_VIEW && intent.data?.scheme == "aether") {
      pendingLaunchIngress = when (intent.data?.getQueryParameter("ingress")) {
        "android_quick_settings" -> "android_quick_settings"
        "android_shortcut" -> "android_shortcut"
        else -> "deep_link"
      }
      return
    }
    if (intent.action != Intent.ACTION_SEND) return
    val context = appContext.reactContext ?: return
    val captureId = intent.getStringExtra(CAPTURE_ID_EXTRA) ?: UUID.randomUUID().toString().also {
      intent.putExtra(CAPTURE_ID_EXTRA, it)
    }
    if (pendingCaptureId == captureId) return
    val declaredMime = intent.type?.lowercase() ?: return
    executor.execute {
      runCatching {
        val parts = when {
          declaredMime.startsWith("text/") -> receiveText(intent)
          declaredMime in supportedImageMimes -> receiveImage(context, intent, captureId, declaredMime)
          else -> null
        } ?: return@runCatching
        CaptureInboxWriter.persist(context, captureId, "android_share", parts)
        pendingCaptureId = captureId
        intent.action = ACTION_ALREADY_CAPTURED
        sendEvent("onCaptureReceived", mapOf("captureId" to captureId))
      }
    }
  }

  private fun receiveText(intent: Intent): JSONArray? {
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim() ?: return null
    if (text.isEmpty() || text.length > MAX_TEXT_LENGTH) return null
    val uri = runCatching { Uri.parse(text) }.getOrNull()
    val part = if (uri?.scheme == "http" || uri?.scheme == "https") {
      CaptureInboxWriter.urlPart(text)
    } else {
      CaptureInboxWriter.textPart(text)
    }
    return JSONArray().put(part)
  }

  private fun receiveImage(
    context: android.content.Context,
    intent: Intent,
    captureId: String,
    declaredMime: String,
  ): JSONArray? {
    val uri = if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
    } ?: return null
    if (uri.scheme != "content") return null
    val resolver = context.contentResolver
    val resolvedMime = resolver.getType(uri)?.lowercase() ?: declaredMime
    if (resolvedMime !in supportedImageMimes) return null
    val metadata = queryMetadata(resolver.query(uri, null, null, null, null))
    if (metadata.size != null && (metadata.size < 0 || metadata.size > MAX_IMAGE_BYTES)) return null
    val extension = extensionFor(resolvedMime)
    val destination = File(CaptureInboxWriter.pendingAssetDirectory(context, captureId), "source.$extension")
    var copied = 0L
    resolver.openInputStream(uri)?.use { input ->
      FileOutputStream(destination).use { output ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val count = input.read(buffer)
          if (count < 0) break
          copied += count
          if (copied > MAX_IMAGE_BYTES) {
            destination.delete()
            return null
          }
          output.write(buffer, 0, count)
        }
      }
    } ?: return null
    return JSONArray().put(
      CaptureInboxWriter.imagePart(
        destination.toURI().toString(),
        resolvedMime,
        copied,
        metadata.name,
      )
    )
  }

  private data class Metadata(val size: Long?, val name: String?)

  private fun queryMetadata(cursor: Cursor?): Metadata {
    cursor ?: return Metadata(null, null)
    cursor.use {
      if (!it.moveToFirst()) return Metadata(null, null)
      val sizeIndex = it.getColumnIndex(OpenableColumns.SIZE)
      val nameIndex = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
      val size = if (sizeIndex >= 0 && !it.isNull(sizeIndex)) it.getLong(sizeIndex) else null
      val name = if (nameIndex >= 0 && !it.isNull(nameIndex)) {
        File(it.getString(nameIndex).replace('\\', '/')).name.take(180)
      } else null
      return Metadata(size, name)
    }
  }

  private fun adoptImageAsset(assetRef: String, captureId: String): String {
    val context = appContext.reactContext ?: error("Application context is unavailable.")
    val source = File(requireNotNull(Uri.parse(assetRef).path))
    val assetRoot = File(context.filesDir, "capture-assets").canonicalFile
    val pendingRoot = File(assetRoot, "pending/$captureId").canonicalFile
    val committedRoot = File(assetRoot, "committed/$captureId").canonicalFile
    val canonicalSource = source.canonicalFile
    require(canonicalSource.path.startsWith(pendingRoot.path + File.separator)
      || canonicalSource.path.startsWith(committedRoot.path + File.separator)) {
      "Capture asset is outside AETHER-managed storage."
    }
    if (canonicalSource.path.startsWith(committedRoot.path + File.separator)) return canonicalSource.toURI().toString()
    committedRoot.mkdirs()
    val destination = File(committedRoot, canonicalSource.name).canonicalFile
    if (!destination.exists()) {
      require(canonicalSource.exists()) { "Capture asset is no longer available." }
      if (!canonicalSource.renameTo(destination)) {
        canonicalSource.copyTo(destination, overwrite = false)
        canonicalSource.delete()
      }
    }
    pendingRoot.deleteRecursively()
    return destination.toURI().toString()
  }

  private fun discardCaptureAssets(captureId: String) {
    val context = appContext.reactContext ?: return
    File(context.filesDir, "capture-assets/pending/$captureId").deleteRecursively()
  }

  private fun extensionFor(mime: String): String = when (mime) {
    "image/jpeg" -> "jpg"
    "image/png" -> "png"
    "image/webp" -> "webp"
    "image/heic" -> "heic"
    "image/heif" -> "heif"
    else -> error("Unsupported image MIME type")
  }

  companion object {
    private const val CAPTURE_ID_EXTRA = "expo.modules.aethercapture.CAPTURE_ID"
    private const val ACTION_ALREADY_CAPTURED = "expo.modules.aethercapture.CAPTURED"
    private const val MAX_TEXT_LENGTH = 10_000
    private const val MAX_IMAGE_BYTES = 15L * 1024L * 1024L
    private val supportedImageMimes = setOf(
      "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"
    )
  }
}
