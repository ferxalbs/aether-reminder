package expo.modules.aethermotion

class FrameAggregator(private val capacity: Int = 64) {
  private var frameCount = 0
  private var jankCount = 0
  private var durationSumNs = 0L
  private var durationSamples = 0
  private val overrunsNs = LongArray(capacity)
  private var overrunCount = 0
  private var overrunIndex = 0
  private var windowStartElapsedMs = 0L

  fun reset(nowElapsedMs: Long) {
    frameCount = 0
    jankCount = 0
    durationSumNs = 0L
    durationSamples = 0
    overrunCount = 0
    overrunIndex = 0
    windowStartElapsedMs = nowElapsedMs
  }

  fun record(durationNs: Long?, isJank: Boolean, overrunNs: Long?) {
    frameCount += 1
    if (isJank) {
      jankCount += 1
    }
    if (durationNs != null && durationNs >= 0) {
      durationSumNs += durationNs
      durationSamples += 1
    }
    if (overrunNs != null) {
      overrunsNs[overrunIndex] = overrunNs
      overrunIndex = (overrunIndex + 1) % capacity
      if (overrunCount < capacity) {
        overrunCount += 1
      }
    }
  }

  fun snapshotAndReset(nowElapsedMs: Long): FrameWindow {
    val window = snapshot(nowElapsedMs)
    reset(nowElapsedMs)
    return window
  }

  fun snapshot(nowElapsedMs: Long): FrameWindow {
    val windowMs = (nowElapsedMs - windowStartElapsedMs).coerceAtLeast(0L)
    val jankRatio = if (frameCount > 0) jankCount.toDouble() / frameCount.toDouble() else null
    val averageMs = if (durationSamples > 0) {
      durationSumNs.toDouble() / durationSamples.toDouble() / 1_000_000.0
    } else {
      null
    }
    return FrameWindow(
      sampleWindowMs = windowMs,
      frameCount = frameCount,
      jankCount = jankCount,
      jankRatio = jankRatio,
      averageFrameDurationMs = averageMs,
      frameOverrunP95Ms = percentileMs(95),
    )
  }

  fun percentileMs(percentile: Int): Double? {
    if (overrunCount == 0) return null
    val values = LongArray(overrunCount)
    System.arraycopy(overrunsNs, 0, values, 0, overrunCount)
    values.sort()
    val rank = kotlin.math.ceil(percentile / 100.0 * overrunCount).toInt().coerceIn(1, overrunCount) - 1
    return values[rank].toDouble() / 1_000_000.0
  }

  data class FrameWindow(
    val sampleWindowMs: Long,
    val frameCount: Int,
    val jankCount: Int,
    val jankRatio: Double?,
    val averageFrameDurationMs: Double?,
    val frameOverrunP95Ms: Double?,
  )
}
