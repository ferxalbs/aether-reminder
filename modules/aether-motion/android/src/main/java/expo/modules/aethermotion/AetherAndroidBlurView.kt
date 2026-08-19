package expo.modules.aethermotion

import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.SystemClock
import android.util.Log
import eightbitlab.com.blurview.BlurView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

private enum class AetherBlurViewConfiguration {
  UNCONFIGURED,
  NONE,
  DIMEZIS,
}

/**
 * Focused Android diagnostic view for comparing Dimezis snapshot scale.
 *
 * The only renderer variable exposed here is scaleFactor. Radius reduction,
 * tint, overlay behavior, target topology, and noise setting match expo-blur
 * 57.0.2's current Android path.
 */
@SuppressLint("ViewConstructor")
class AetherAndroidBlurView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val debugLifecycle = context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
  private val debugId = if (debugLifecycle) nextDebugId++ else 0
  private var blurRadius = 50f
  private val blurReduction = 4f
  private var tint = AetherBlurTint.DEFAULT
  private var scaleFactor = AetherBlurScalePolicy.DEFAULT_SCALE_FACTOR
  private var blurTargetId: Int? = null
  private var blurTarget: AetherAndroidBlurTargetView? = null
  private var blurConfiguration = AetherBlurViewConfiguration.UNCONFIGURED

  private val blurView = BlurView(context).also {
    it.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    addView(it)
  }

  init {
    debugLog("constructor")
  }

  fun setBlurTargetId(id: Int?) {
    if (id == blurTargetId) {
      debugLog("target unchanged id=$id")
      return
    }
    debugLog("target $blurTargetId -> $id")
    blurTargetId = id
    blurTarget = id?.let { appContext.findView<AetherAndroidBlurTargetView>(it) }
    if (isAttachedToWindow) {
      configureBlurView()
      applyCurrentBlurSettings()
    }
  }

  fun setBlurRadius(radius: Float) {
    debugLog("radius $blurRadius -> $radius")
    blurRadius = radius
    if (blurConfiguration == AetherBlurViewConfiguration.UNCONFIGURED) return

    if (blurConfiguration == AetherBlurViewConfiguration.DIMEZIS && blurTarget != null) {
      blurView.setBlurEnabled(radius != 0f)
      if (radius > 0f) {
        blurView.setBlurRadius(radius / blurReduction)
        blurView.invalidate()
      }
    } else {
      setBackgroundColor(tint.toBlurEffect(radius))
    }
  }

  fun setTint(value: String) {
    debugLog("tint ${tint.name} -> $value")
    tint = AetherBlurTint.from(value)
  }

  fun setScaleFactor(rawScaleFactor: Float) {
    val next = AetherBlurScalePolicy.resolve(rawScaleFactor)
    if (next == scaleFactor) {
      debugLog("scale unchanged value=$next")
      return
    }
    debugLog("scale $scaleFactor -> $next")
    scaleFactor = next
    if (isAttachedToWindow && blurConfiguration == AetherBlurViewConfiguration.DIMEZIS) {
      configureBlurView()
      applyCurrentBlurSettings()
    }
  }

  fun applyTint() {
    debugLog("applyTint configuration=$blurConfiguration tint=${tint.name}")
    if (blurConfiguration == AetherBlurViewConfiguration.UNCONFIGURED) return
    if (blurConfiguration == AetherBlurViewConfiguration.DIMEZIS && blurTarget != null) {
      blurView.setOverlayColor(tint.toBlurEffect(blurRadius))
    } else {
      setBackgroundColor(tint.toBlurEffect(blurRadius))
    }
    blurView.invalidate()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    debugLog("attached size=${width}x$height")
    if (blurConfiguration != AetherBlurViewConfiguration.DIMEZIS) {
      blurTarget = blurTargetId?.let { appContext.findView<AetherAndroidBlurTargetView>(it) }
      configureBlurView()
      applyCurrentBlurSettings()
    }
  }

  override fun onDetachedFromWindow() {
    debugLog("detached size=${width}x$height")
    super.onDetachedFromWindow()
  }

  override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
    super.onSizeChanged(width, height, oldWidth, oldHeight)
    debugLog("size ${oldWidth}x$oldHeight -> ${width}x$height")
  }

  private fun configureBlurView() {
    val target = blurTarget
    if (target == null) {
      blurView.setBlurEnabled(false)
      blurConfiguration = AetherBlurViewConfiguration.NONE
      return
    }

    val decorView = appContext.throwingActivity.window?.decorView
      ?: throw IllegalStateException("Failed to find a decor view for AETHER Android blur")

    val dimezisBlurTarget = target.blurTargetView
    debugLog(
      "setupWith target=${System.identityHashCode(dimezisBlurTarget)} " +
        "targetSize=${dimezisBlurTarget.width}x${dimezisBlurTarget.height} scale=$scaleFactor",
    )
    blurView.setupWith(
      dimezisBlurTarget,
      scaleFactor,
      AetherBlurScalePolicy.APPLY_NOISE,
    )
      .setFrameClearDrawable(decorView.background)
      .setBlurRadius(blurRadius / blurReduction)

    blurConfiguration = AetherBlurViewConfiguration.DIMEZIS
  }

  private fun applyCurrentBlurSettings() {
    setBlurRadius(blurRadius)
    applyTint()
  }

  private fun debugLog(message: String) {
    if (!debugLifecycle) return
    Log.d(DEBUG_TAG, "view=$debugId t=${SystemClock.uptimeMillis()} $message")
  }

  private companion object {
    const val DEBUG_TAG = "AetherBlurLifecycle"
    var nextDebugId = 1
  }
}
