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
  private var lowMemory: Bool?
  private var receivedMemoryWarning = false

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
    tracking = true
    startDisplayLink()
  }

  private func pauseMonitoring() {
    tracking = false
    displayLink?.invalidate()
    displayLink = nil
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
    let durationMs = (link.targetTimestamp - link.timestamp) * 1000.0
    let expectedMs: Double
    if let currentRefreshRateHz, currentRefreshRateHz > 0 {
      expectedMs = 1000.0 / currentRefreshRateHz
    } else if let maximumRefreshRateHz, maximumRefreshRateHz > 0 {
      expectedMs = 1000.0 / maximumRefreshRateHz
    } else {
      expectedMs = 1000.0 / 60.0
    }
    let overrunMs = durationMs - expectedMs
    let isJank = durationMs > expectedMs * 1.5
    aggregator.record(durationMs: durationMs, isJank: isJank, overrunMs: overrunMs)
  }

  private func emitSnapshot() {
    readRuntimeSignals()
    sendEvent(snapshotEvent, snapshotMap())
  }

  private func snapshotMap() -> [String: Any?] {
    let now = CACurrentMediaTime() * 1000
    let frames = aggregator.snapshotAndReset(nowMs: now)
    let memoryFlag = receivedMemoryWarning ? true : lowMemory
    receivedMemoryWarning = false
    return [
      "platform": "ios",
      "currentRefreshRateHz": currentRefreshRateHz,
      "maximumRefreshRateHz": maximumRefreshRateHz,
      "lowPowerMode": lowPowerMode,
      "lowMemory": memoryFlag,
      "lowRamDevice": nil,
      "thermalState": thermalState,
      "warmUpActive": now < warmUpUntilMs,
      "timestampMs": Date().timeIntervalSince1970 * 1000,
      "frames": [
        "sampleWindowMs": frames.sampleWindowMs,
        "frameCount": frames.frameCount,
        "jankCount": frames.jankCount,
        "jankRatio": frames.jankRatio as Any,
        "averageFrameDurationMs": frames.averageFrameDurationMs as Any,
        "frameOverrunP95Ms": frames.frameOverrunP95Ms as Any,
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
    if let link = displayLink, link.duration > 0 {
      currentRefreshRateHz = 1.0 / link.duration
    } else if let maximumRefreshRateHz {
      currentRefreshRateHz = maximumRefreshRateHz
    } else {
      currentRefreshRateHz = nil
    }
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
    receivedMemoryWarning = true
    lowMemory = true
  }
}
