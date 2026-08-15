import ExpoModulesCore
import Foundation
import QuartzCore
import UIKit

private let snapshotEvent = "onMotionSnapshot"
private let snapshotIntervalMs: Double = 750
private let warmupMs: Double = 2500

final class AetherMotionModule: Module {
  private final class DisplayLinkProxy: NSObject {
    weak var owner: AetherMotionModule?
    @objc func tick(_ link: CADisplayLink) {
      owner?.handleDisplayLink(link)
    }
  }

  private let aggregator = FrameAggregator()
  private let cadenceSmoother = RefreshRateSmoother(capacity: 5)
  private let displayLinkProxy = DisplayLinkProxy()
  private var displayLink: CADisplayLink?
  private var emitTimer: Timer?
  private var observing = false
  private var tracking = false
  private var warmUpUntilMs: Double = 0
  private var currentRefreshRateHz: Double?
  private var maximumRefreshRateHz: Double?
  private var lowPowerMode = false
  private var thermalState = "unknown"
  private var memoryPressureUntilMs: Double?
  private var previousTargetTimestamp: Double?

  func definition() -> ModuleDefinition {
    Name("AetherMotion")
    Events(snapshotEvent)

    Function("getCapabilities") {
      self.readStaticSignals()
      return self.capabilities()
    }

    Function("getSnapshot") {
      self.readRuntimeSignals()
      return self.snapshotMap()
    }

    OnStartObserving {
      self.startObserving()
    }

    OnStopObserving {
      self.stopObserving()
    }

    OnAppEntersForeground {
      if self.observing {
        self.resumeMonitoring()
      }
    }

    OnAppEntersBackground {
      self.pauseMonitoring()
    }

    OnDestroy {
      self.stopObserving()
    }
  }

  private func startObserving() {
    guard !observing else { return }
    observing = true
    displayLinkProxy.owner = self
    readStaticSignals()
    readRuntimeSignals()
    registerSystemObservers()
    resumeMonitoring()
    startEmitTimer()
  }

  private func stopObserving() {
    observing = false
    emitTimer?.invalidate()
    emitTimer = nil
    pauseMonitoring()
    unregisterSystemObservers()
  }

  private func resumeMonitoring() {
    readRuntimeSignals()
    let now = CACurrentMediaTime() * 1000
    warmUpUntilMs = now + warmupMs
    aggregator.reset(nowMs: now)
    cadenceSmoother.reset()
    previousTargetTimestamp = nil
    tracking = true
    startDisplayLink()
  }

  private func pauseMonitoring() {
    tracking = false
    displayLink?.invalidate()
    displayLink = nil
    previousTargetTimestamp = nil
  }

  private func startDisplayLink() {
    if displayLink != nil { return }
    let link = CADisplayLink(target: displayLinkProxy, selector: #selector(DisplayLinkProxy.tick(_:)))
    link.add(to: .main, forMode: .common)
    displayLink = link
  }

  private func startEmitTimer() {
    emitTimer?.invalidate()
    emitTimer = Timer.scheduledTimer(withTimeInterval: snapshotIntervalMs / 1000.0, repeats: true) { [weak self] _ in
      self?.emitSnapshot()
    }
    if let emitTimer {
      RunLoop.main.add(emitTimer, forMode: .common)
    }
  }

  @objc
  private func handleDisplayLink(_ link: CADisplayLink) {
    guard tracking else { return }
    guard let intervalSeconds = CadenceTelemetry.scheduledIntervalSeconds(
      timestamp: link.timestamp,
      targetTimestamp: link.targetTimestamp
    ) else {
      previousTargetTimestamp = link.targetTimestamp
      return
    }

    if let hz = CadenceTelemetry.cadenceHz(intervalSeconds: intervalSeconds) {
      currentRefreshRateHz = cadenceSmoother.push(hz)
    }

    let delaySeconds = CadenceTelemetry.callbackDelaySeconds(
      previousTargetTimestamp: previousTargetTimestamp,
      currentTimestamp: link.timestamp
    )
    previousTargetTimestamp = link.targetTimestamp

    aggregator.record(
      durationMs: intervalSeconds * 1000.0,
      isJank: false,
      overrunMs: delaySeconds.map { $0 * 1000.0 }
    )
  }

  private func emitSnapshot() {
    readRuntimeSignals()
    sendEvent(snapshotEvent, snapshotMap())
  }

  private func snapshotMap() -> [String: Any?] {
    let now = CACurrentMediaTime() * 1000
    let frames = aggregator.snapshotAndReset(nowMs: now)
    let memoryActive = MemoryPressurePolicy.isActive(nowMs: now, untilMs: memoryPressureUntilMs)
    return [
      "platform": "ios",
      "currentRefreshRateHz": currentRefreshRateHz,
      "maximumRefreshRateHz": maximumRefreshRateHz,
      "lowPowerMode": lowPowerMode,
      "lowMemory": memoryActive,
      "memoryPressureActive": memoryActive,
      "lowRamDevice": nil,
      "thermalState": thermalState,
      "warmUpActive": now < warmUpUntilMs,
      "timestampMs": Date().timeIntervalSince1970 * 1000,
      "frames": [
        "sampleWindowMs": frames.sampleWindowMs,
        "frameCount": frames.frameCount,
        "jankCount": 0,
        "jankRatio": NSNull(),
        "averageFrameDurationMs": frames.averageFrameDurationMs as Any,
        "frameOverrunP95Ms": NSNull(),
        "cadenceIntervalMs": frames.averageFrameDurationMs as Any,
        "callbackDelayP95Ms": frames.frameOverrunP95Ms as Any,
      ],
    ]
  }

  private func capabilities() -> [String: Any?] {
    [
      "platform": "ios",
      "androidApiLevel": nil,
      "maximumRefreshRateHz": maximumRefreshRateHz,
      "lowRamDevice": nil,
      "supportsNativeBlur": true,
      "nativeTelemetryAvailable": true,
    ]
  }

  private func readStaticSignals() {
    let maxFps = Double(UIScreen.main.maximumFramesPerSecond)
    maximumRefreshRateHz = maxFps > 0 ? maxFps : nil
  }

  private func readRuntimeSignals() {
    lowPowerMode = ProcessInfo.processInfo.isLowPowerModeEnabled
    thermalState = ThermalMapper.fromProcessInfo(ProcessInfo.processInfo.thermalState)
  }

  private func registerSystemObservers() {
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleThermalChange),
      name: ProcessInfo.thermalStateDidChangeNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handlePowerChange),
      name: .NSProcessInfoPowerStateDidChange,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleMemoryWarning),
      name: UIApplication.didReceiveMemoryWarningNotification,
      object: nil
    )
  }

  private func unregisterSystemObservers() {
    NotificationCenter.default.removeObserver(self)
  }

  @objc
  private func handleThermalChange() {
    thermalState = ThermalMapper.fromProcessInfo(ProcessInfo.processInfo.thermalState)
  }

  @objc
  private func handlePowerChange() {
    lowPowerMode = ProcessInfo.processInfo.isLowPowerModeEnabled
  }

  @objc
  private func handleMemoryWarning() {
    memoryPressureUntilMs = MemoryPressurePolicy.extend(nowMs: CACurrentMediaTime() * 1000)
  }
}
