package expo.modules.aethermotion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FrameAggregatorTest {
  @Test
  fun emptyWindowHasNullRatios() {
    val aggregator = FrameAggregator()
    aggregator.reset(0)
    val window = aggregator.snapshot(750)
    assertEquals(750, window.sampleWindowMs)
    assertEquals(0, window.frameCount)
    assertEquals(0, window.jankCount)
    assertNull(window.jankRatio)
    assertNull(window.averageFrameDurationMs)
    assertNull(window.frameOverrunP95Ms)
  }

  @Test
  fun computesJankRatioAndAverageDuration() {
    val aggregator = FrameAggregator()
    aggregator.reset(0)
    aggregator.record(8_000_000, false, 0)
    aggregator.record(20_000_000, true, 4_000_000)
    val window = aggregator.snapshot(750)
    assertEquals(2, window.frameCount)
    assertEquals(1, window.jankCount)
    assertEquals(0.5, window.jankRatio!!, 0.0001)
    assertEquals(14.0, window.averageFrameDurationMs!!, 0.0001)
  }

  @Test
  fun ringBufferStaysBoundedAndReportsP95() {
    val aggregator = FrameAggregator(4)
    aggregator.reset(0)
    aggregator.record(8_000_000, false, 1_000_000)
    aggregator.record(8_000_000, false, 2_000_000)
    aggregator.record(8_000_000, false, 3_000_000)
    aggregator.record(8_000_000, false, 4_000_000)
    aggregator.record(8_000_000, false, 10_000_000)
    val p95 = aggregator.percentileMs(95)
    assertEquals(10.0, p95!!, 0.0001)
  }

  @Test
  fun snapshotAndResetClearsCounters() {
    val aggregator = FrameAggregator()
    aggregator.reset(0)
    aggregator.record(8_000_000, true, 1_000_000)
    val first = aggregator.snapshotAndReset(750)
    assertEquals(1, first.frameCount)
    val second = aggregator.snapshot(1500)
    assertEquals(0, second.frameCount)
    assertNull(second.jankRatio)
  }
}
