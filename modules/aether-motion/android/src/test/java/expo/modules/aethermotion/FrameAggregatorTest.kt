package expo.modules.aethermotion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

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
    assertEquals(4, aggregator.storedOverrunCount())
    assertEquals(4, aggregator.ringCapacity())
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

  @Test
  fun percentileFromCopiedBufferIsIndependentOfLaterWrites() {
    val samples = longArrayOf(1_000_000, 2_000_000, 3_000_000, 4_000_000)
    val p95 = FrameAggregator.percentileFromCopy(samples, 95)
    assertEquals(4.0, p95!!, 0.0001)
    samples[3] = 99_000_000
    assertEquals(4.0, FrameAggregator.percentileFromCopy(longArrayOf(1_000_000, 2_000_000, 3_000_000, 4_000_000), 95)!!, 0.0001)
  }

  @Test
  fun repeatedResetDoesNotProduceInvalidState() {
    val aggregator = FrameAggregator(8)
    aggregator.reset(0)
    repeat(50) { cycle ->
      aggregator.record(8_000_000, cycle % 2 == 0, 500_000)
      val window = aggregator.snapshotAndReset((cycle + 1) * 750L)
      assertValidWindow(window)
      val empty = aggregator.snapshotAndReset((cycle + 1) * 750L + 1)
      assertValidWindow(empty)
      assertEquals(0, empty.frameCount)
      assertEquals(0, empty.jankCount)
      assertNull(empty.jankRatio)
      assertNull(empty.frameOverrunP95Ms)
    }
  }

  @Test
  fun concurrentRecordAndSnapshotAndResetPreservesInvariants() {
    val aggregator = FrameAggregator(64)
    aggregator.reset(0)
    val recorderCount = 6
    val snapshotsPerSnapper = 400
    val recordsPerThread = 8_000
    val start = CyclicBarrier(recorderCount + 2)
    val done = CountDownLatch(recorderCount + 2)
    val completedFrames = AtomicLong(0)
    val completedJank = AtomicLong(0)
    val failures = AtomicReference<Throwable?>(null)
    val snapWindows = AtomicInteger(0)

    fun fail(error: Throwable) {
      failures.compareAndSet(null, error)
    }

    repeat(recorderCount) {
      Thread {
        try {
          start.await(5, TimeUnit.SECONDS)
          repeat(recordsPerThread) { index ->
            aggregator.record(8_000_000, index % 7 == 0, 1_000_000)
          }
        } catch (error: Throwable) {
          fail(error)
        } finally {
          done.countDown()
        }
      }.start()
    }

    repeat(2) { snapper ->
      Thread {
        try {
          start.await(5, TimeUnit.SECONDS)
          repeat(snapshotsPerSnapper) { index ->
            val window = aggregator.snapshotAndReset(750L * (index + 1) + snapper)
            assertValidWindow(window)
            completedFrames.addAndGet(window.frameCount.toLong())
            completedJank.addAndGet(window.jankCount.toLong())
            snapWindows.incrementAndGet()
          }
        } catch (error: Throwable) {
          fail(error)
        } finally {
          done.countDown()
        }
      }.start()
    }

    assertTrue("concurrency stress timed out", done.await(20, TimeUnit.SECONDS))
    failures.get()?.let { throw AssertionError("concurrent aggregator failed", it) }

    val remainder = aggregator.snapshotAndReset(1_000_000)
    assertValidWindow(remainder)
    val totalFrames = completedFrames.addAndGet(remainder.frameCount.toLong())
    val totalJank = completedJank.addAndGet(remainder.jankCount.toLong())
    val expectedFrames = recorderCount.toLong() * recordsPerThread
    val expectedJank = recorderCount.toLong() * (recordsPerThread / 7 + if (recordsPerThread % 7 > 0) 1 else 0)

    assertEquals(expectedFrames, totalFrames)
    assertEquals(expectedJank, totalJank)
    assertTrue(snapWindows.get() > 0)
    assertTrue(aggregator.storedOverrunCount() <= aggregator.ringCapacity())
  }

  @Test
  fun heavyConcurrentSamplingNeverExceedsRingCapacity() {
    val capacity = 32
    val aggregator = FrameAggregator(capacity)
    aggregator.reset(0)
    val workers = 8
    val start = CyclicBarrier(workers)
    val done = CountDownLatch(workers)
    val failures = AtomicReference<Throwable?>(null)

    repeat(workers) {
      Thread {
        try {
          start.await(5, TimeUnit.SECONDS)
          repeat(5_000) { index ->
            aggregator.record(8_000_000, false, index.toLong())
            assertTrue(aggregator.storedOverrunCount() <= capacity)
          }
        } catch (error: Throwable) {
          failures.compareAndSet(null, error)
        } finally {
          done.countDown()
        }
      }.start()
    }

    assertTrue(done.await(20, TimeUnit.SECONDS))
    failures.get()?.let { throw AssertionError("bounded overrun storage failed", it) }
    assertEquals(capacity, aggregator.storedOverrunCount())
    val p95 = aggregator.percentileMs(95)
    assertNotNull(p95)
    assertFalse(p95!!.isNaN())
    assertFalse(p95.isInfinite())
  }

  private fun assertValidWindow(window: FrameAggregator.FrameWindow) {
    assertTrue(window.sampleWindowMs >= 0)
    assertTrue(window.frameCount >= 0)
    assertTrue(window.jankCount >= 0)
    assertTrue(window.jankCount <= window.frameCount)
    val ratio = window.jankRatio
    if (window.frameCount == 0) {
      assertNull(ratio)
    } else {
      assertNotNull(ratio)
      assertFalse(ratio!!.isNaN())
      assertFalse(ratio.isInfinite())
      assertTrue(ratio >= 0.0)
      assertTrue(ratio <= 1.0)
    }
    window.averageFrameDurationMs?.let {
      assertFalse(it.isNaN())
      assertFalse(it.isInfinite())
      assertTrue(it >= 0.0)
    }
    window.frameOverrunP95Ms?.let {
      assertFalse(it.isNaN())
      assertFalse(it.isInfinite())
    }
  }
}
