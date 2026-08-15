package expo.modules.aethermotion

import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.view.Window
import androidx.metrics.performance.FrameData
import androidx.metrics.performance.FrameDataApi24
import androidx.metrics.performance.FrameDataApi31
import androidx.metrics.performance.JankStats
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AetherMotionModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private val aggregator = FrameAggregator()
  @Volatile private var observing = false
  @Volatile private var tracking = false
  @Volatile private var warmUpUntilElapsedMs = 0L
  @Volatile private var currentRefreshRateHz: Float? = null
  @Volatile private var maximumRefreshRateHz: Float? = null
  @Volatile private var lowPowerMode = false
  @Volatile private var thermalState = "unknown"
  @Volatile private var lowMemory: Boolean? = null
  @Volatile private var lowRamDevice: Boolean? = null
  private var jankStats: JankStats? = null
  private var thermalListener: PowerManager.OnThermalStatusChangedListener? = null
  private var powerSaveReceiver: BroadcastReceiver? = null

  private val emitRunnable = object : Runnable {
    override fun run() {
      if (!observing) return
      emitSnapshot()
      handler.postDelayed(this, SNAPSHOT_INTERVAL_MS)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("AetherMotion")
    Events(SNAPSHOT_EVENT)

    Function("getCapabilities") { capabilities() }
    Function("getSnapshot") { snapshotMap() }

    OnStartObserving {
      startObserving()
    }
    OnStopObserving {
      stopObserving()
    }
    OnActivityEntersForeground {
      if (observing) resumeMonitoring()
    }
    OnActivityEntersBackground {
      pauseMonitoring()
    }
    OnDestroy {
      stopObserving()
    }
  }

  private fun startObserving() {
    if (observing) return
    observing = true
    readStaticSignals()
    readRuntimeSignals()
    registerSystemListeners()
    resumeMonitoring()
    handler.postDelayed(emitRunnable, SNAPSHOT_INTERVAL_MS)
  }

  private fun stopObserving() {
    observing = false
    handler.removeCallbacks(emitRunnable)
    pauseMonitoring()
    unregisterSystemListeners()
  }

  private fun resumeMonitoring() {
    readRuntimeSignals()
    warmUpUntilElapsedMs = SystemClock.elapsedRealtime() + WARMUP_MS
    aggregator.reset(SystemClock.elapsedRealtime())
    attachJankStats()
    tracking = true
  }

  private fun pauseMonitoring() {
    tracking = false
    jankStats?.isTrackingEnabled = false
  }

  private fun attachJankStats() {
    val window = currentWindow() ?: return
    if (jankStats == null) {
      jankStats = JankStats.createAndTrack(window, ::onFrame)
    }
    jankStats?.isTrackingEnabled = true
  }

  private fun onFrame(frameData: FrameData) {
    if (!tracking) return
    val durationNs = frameDurationNs(frameData)
    val overrunNs = if (Build.VERSION.SDK_INT >= 31 && frameData is FrameDataApi31) {
      frameData.frameOverrunNanos
    } else {
      null
    }
    aggregator.record(durationNs, frameData.isJank, overrunNs)
  }

  private fun frameDurationNs(frameData: FrameData): Long? {
    if (Build.VERSION.SDK_INT >= 31 && frameData is FrameDataApi31) {
      return frameData.frameDurationTotalNanos
    }
    if (frameData is FrameDataApi24) {
      return frameData.frameDurationCpuNanos
    }
    return frameData.frameDurationUiNanos
  }

  private fun emitSnapshot() {
    readRuntimeSignals()
    appContext.reactContext ?: return
    sendEvent(SNAPSHOT_EVENT, snapshotMap())
  }

  private fun snapshotMap(): Map<String, Any?> {
    val now = SystemClock.elapsedRealtime()
    val frames = aggregator.snapshotAndReset(now)
    return mapOf(
      "platform" to "android",
      "currentRefreshRateHz" to currentRefreshRateHz?.toDouble(),
      "maximumRefreshRateHz" to maximumRefreshRateHz?.toDouble(),
      "lowPowerMode" to lowPowerMode,
      "lowMemory" to lowMemory,
      "lowRamDevice" to lowRamDevice,
      "thermalState" to thermalState,
      "warmUpActive" to (now < warmUpUntilElapsedMs),
      "timestampMs" to System.currentTimeMillis(),
      "frames" to mapOf(
        "sampleWindowMs" to frames.sampleWindowMs.toDouble(),
        "frameCount" to frames.frameCount,
        "jankCount" to frames.jankCount,
        "jankRatio" to frames.jankRatio,
        "averageFrameDurationMs" to frames.averageFrameDurationMs,
        "frameOverrunP95Ms" to frames.frameOverrunP95Ms,
      ),
    )
  }

  private fun capabilities(): Map<String, Any?> {
    readStaticSignals()
    return mapOf(
      "platform" to "android",
      "androidApiLevel" to Build.VERSION.SDK_INT,
      "maximumRefreshRateHz" to maximumRefreshRateHz?.toDouble(),
      "lowRamDevice" to lowRamDevice,
      "supportsNativeBlur" to (Build.VERSION.SDK_INT >= 31),
      "nativeTelemetryAvailable" to true,
    )
  }

  private fun readStaticSignals() {
    val activityManager = systemService<ActivityManager>(Context.ACTIVITY_SERVICE)
    lowRamDevice = activityManager?.isLowRamDevice
    val display = currentWindow()?.decorView?.display
      ?: appContext.currentActivity?.display
    if (display != null) {
      val supported = display.supportedModes.map { it.refreshRate }
      maximumRefreshRateHz = supported.maxOrNull() ?: display.refreshRate
    }
  }

  private fun readRuntimeSignals() {
    val powerManager = systemService<PowerManager>(Context.POWER_SERVICE)
    lowPowerMode = powerManager?.isPowerSaveMode == true
    thermalState = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ThermalMapper.fromAndroidStatus(powerManager?.currentThermalStatus, Build.VERSION.SDK_INT)
    } else {
      "unknown"
    }
    val activityManager = systemService<ActivityManager>(Context.ACTIVITY_SERVICE)
    if (activityManager != null) {
      val info = ActivityManager.MemoryInfo()
      activityManager.getMemoryInfo(info)
      lowMemory = info.lowMemory
    }
    val display = currentWindow()?.decorView?.display
      ?: appContext.currentActivity?.display
    currentRefreshRateHz = display?.refreshRate
    if (maximumRefreshRateHz == null && display != null) {
      maximumRefreshRateHz = display.supportedModes.maxOfOrNull { it.refreshRate } ?: display.refreshRate
    }
  }

  private fun registerSystemListeners() {
    val context = appContext.reactContext ?: return
    val powerManager = systemService<PowerManager>(Context.POWER_SERVICE)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && powerManager != null && thermalListener == null) {
      val listener = PowerManager.OnThermalStatusChangedListener { status ->
        thermalState = ThermalMapper.fromAndroidStatus(status, Build.VERSION.SDK_INT)
      }
      thermalListener = listener
      powerManager.addThermalStatusListener(handler::post, listener)
    }
    if (powerSaveReceiver == null) {
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
          lowPowerMode = powerManager?.isPowerSaveMode == true
        }
      }
      powerSaveReceiver = receiver
      context.registerReceiver(receiver, IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED))
    }
  }

  private fun unregisterSystemListeners() {
    val context = appContext.reactContext
    val powerManager = systemService<PowerManager>(Context.POWER_SERVICE)
    val listener = thermalListener
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && powerManager != null && listener != null) {
      powerManager.removeThermalStatusListener(listener)
    }
    thermalListener = null
    val receiver = powerSaveReceiver
    if (context != null && receiver != null) {
      runCatching { context.unregisterReceiver(receiver) }
    }
    powerSaveReceiver = null
  }

  private fun currentWindow(): Window? = appContext.currentActivity?.window

  private inline fun <reified T> systemService(name: String): T? {
    val context = appContext.reactContext ?: appContext.currentActivity ?: return null
    return context.getSystemService(name) as? T
  }

  companion object {
    const val SNAPSHOT_EVENT = "onMotionSnapshot"
    const val SNAPSHOT_INTERVAL_MS = 750L
    const val WARMUP_MS = 2500L
  }
}
