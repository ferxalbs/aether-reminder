package expo.modules.aethermotion

import android.annotation.SuppressLint
import android.content.Context
import eightbitlab.com.blurview.BlurTarget
import expo.modules.kotlin.AppContext

/**
 * The Dimezis target is laid out by React Native's UIManager, not by the
 * target's own ViewGroup layout pass. This mirrors the supported Expo Blur
 * target adapter while keeping the diagnostic's target in the same module as
 * its Dimezis blur view.
 */
internal class UIManagerCompatibleAetherBlurTarget(
  context: Context,
) : BlurTarget(context) {
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    // No-op: React Native lays out RN-managed children directly.
  }

  @SuppressLint("MissingSuperCall")
  override fun requestLayout() {
    // No-op: React Native owns layout invalidation for this managed target.
  }
}
