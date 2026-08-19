package expo.modules.aethermotion

import android.annotation.SuppressLint
import android.content.Context
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

  fun setBlurTargetId(id: Int?) {
    if (id == blurTargetId) return
    blurTargetId = id
    blurTarget = id?.let { appContext.findView<AetherAndroidBlurTargetView>(it) }
    if (isAttachedToWindow) {
      configureBlurView()
      applyCurrentBlurSettings()
    }
  }

  fun setBlurRadius(radius: Float) {
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
    tint = AetherBlurTint.from(value)
  }

  fun setScaleFactor(rawScaleFactor: Float) {
    val next = AetherBlurScalePolicy.resolve(rawScaleFactor)
    if (next == scaleFactor) return
    scaleFactor = next
    if (isAttachedToWindow && blurConfiguration == AetherBlurViewConfiguration.DIMEZIS) {
      configureBlurView()
      applyCurrentBlurSettings()
    }
  }

  fun applyTint() {
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
    if (blurConfiguration != AetherBlurViewConfiguration.DIMEZIS) {
      blurTarget = blurTargetId?.let { appContext.findView<AetherAndroidBlurTargetView>(it) }
      configureBlurView()
      applyCurrentBlurSettings()
    }
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
}
