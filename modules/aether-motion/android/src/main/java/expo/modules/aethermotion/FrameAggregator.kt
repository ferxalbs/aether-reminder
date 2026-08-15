package expo.modules.aethermotion

/**
 * Thread-safe bounded frame aggregator.
 *
 * JankStats callbacks and the 750 ms snapshot timer must not be assumed to
 * share a thread. All mutable window state is guarded by [lock]. The per-frame
 * [record] path is O(1) and does not allocate. Percentile sorting happens on a
 * copied buffer outside the lock. [snapshotAndReset] is a single atomic
 * operation: a frame belongs entirely to the previous window or the next one.
 */
class FrameAggregator(private val capacity: Int = 64) {
  private val lock = Any()
  private var frameCount = 0
  private var jankCount = 0
  private var durationSumNs = 0L
  private var durationSamples = 0
  private val overrunsNs = LongArray(capacity)
  private var overrunCount = 0
  private var overrunIndex = 0
  private var windowStartElapsedMs = 0L

  fun reset(nowElapsedMs: Long) {
    synchronized(lock) {
      resetLocked(nowElapsedMs)
    }
  }

  fun record(durationNs: Long?, isJank: Boolean, overrunNs: Long?) {
    synchronized(lock) {
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
  }

  fun snapshotAndReset(nowElapsedMs: Long): FrameWindow {
    val captured: CapturedWindow
    synchronized(lock) {
      captured = captureLocked(nowElapsedMs)
      resetLocked(nowElapsedMs)
    }
    return captured.toFrameWindow()
  }

  fun snapshot(nowElapsedMs: Long): FrameWindow {
    val captured: CapturedWindow
    synchronized(lock) {
      captured = captureLocked(nowElapsedMs)
    }
    return captured.toFrameWindow()
  }

  fun percentileMs(percentile: Int): Double? {
    val copy: LongArray
    synchronized(lock) {
      if (overrunCount == 0) return null
      copy = LongArray(overrunCount)
      System.arraycopy(overrunsNs, 0, copy, 0, overrunCount)
    }
    return percentileFromCopy(copy, percentile)
  }

  fun storedOverrunCount(): Int {
    synchronized(lock) {
      return overrunCount
    }
  }

  fun ringCapacity(): Int = capacity

  private fun resetLocked(nowElapsedMs: Long) {
    frameCount = 0
    jankCount = 0
    durationSumNs = 0L
    durationSamples = 0
    overrunCount = 0
    overrunIndex = 0
    windowStartElapsedMs = nowElapsedMs
  }

  private fun captureLocked(nowElapsedMs: Long): CapturedWindow {
    val overruns = if (overrunCount == 0) {
      LongArray(0)
    } else {
      val copy = LongArray(overrunCount)
      System.arraycopy(overrunsNs, 0, copy, 0, overrunCount)
      copy
    }
    return CapturedWindow(
      sampleWindowMs = (nowElapsedMs - windowStartElapsedMs).coerceAtLeast(0L),
      frameCount = frameCount,
      jankCount = jankCount,
      durationSumNs = durationSumNs,
      durationSamples = durationSamples,
      overrunsNs = overruns,
    )
  }

  private data class CapturedWindow(
    val sampleWindowMs: Long,
    val frameCount: Int,
    val jankCount: Int,
    val durationSumNs: Long,
    val durationSamples: Int,
    val overrunsNs: LongArray,
  ) {
    fun toFrameWindow(): FrameWindow {
      val jankRatio = if (frameCount > 0) jankCount.toDouble() / frameCount.toDouble() else null
      val averageMs = if (durationSamples > 0) {
        durationSumNs.toDouble() / durationSamples.toDouble() / 1_000_000.0
      } else {
        null
      }
      return FrameWindow(
        sampleWindowMs = sampleWindowMs,
        frameCount = frameCount,
        jankCount = jankCount,
        jankRatio = jankRatio,
        averageFrameDurationMs = averageMs,
        frameOverrunP95Ms = percentileFromCopy(overrunsNs, 95),
      )
    }
  }

  data class FrameWindow(
    val sampleWindowMs: Long,
    val frameCount: Int,
    val jankCount: Int,
    val jankRatio: Double?,
    val averageFrameDurationMs: Double?,
    val frameOverrunP95Ms: Double?,
  )

  companion object {
    fun percentileFromCopy(values: LongArray, percentile: Int): Double? {
      if (values.isEmpty()) return null
      val sorted = values.copyOf()
      sorted.sort()
      val rank = kotlin.math.ceil(percentile / 100.0 * sorted.size).toInt().coerceIn(1, sorted.size) - 1
      val value = sorted[rank].toDouble() / 1_000_000.0
      if (value.isNaN() || value.isInfinite()) return null
      return value
    }
  }
}
