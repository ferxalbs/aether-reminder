package expo.modules.aethermotion

internal object AetherBlurScalePolicy {
  const val DEFAULT_SCALE_FACTOR = 4f
  const val APPLY_NOISE = false

  fun resolve(rawScaleFactor: Float): Float = when (rawScaleFactor) {
    1f, 2f, 4f -> rawScaleFactor
    else -> DEFAULT_SCALE_FACTOR
  }
}
