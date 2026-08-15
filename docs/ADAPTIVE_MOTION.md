# Adaptive Motion Engine

AETHER uses one motion language. Fidelity changes with runtime conditions.
Identity does not.

This document describes the implemented policy. The numbers are AETHER
engineering thresholds, not Android or iOS platform guarantees.

## Architecture

```text
native telemetry (750 ms snapshots)
        │
        ▼
pure governor / policy reducer
        │
        ▼
MotionProfile (tier + budget + a11y flags)
        │
        ├── presets (task / navigation / orb / sheet / capture)
        └── AdaptiveBlur / AdaptiveGlass
```

JavaScript never receives a per-frame event. Native frame callbacks only
increment bounded counters. Aggregation happens on a 750 ms timer.

The React tree re-renders only when the effective profile changes.

## Why device and SoC lists are forbidden

CPU and GPU names are a weak proxy for what the user is experiencing now.
Refresh rate, resolution, thermal throttling, Low Power / Power Saver, RAM
pressure, system load, and accessibility all change the same hardware.

AETHER therefore combines:

1. static capabilities (low-RAM flag, API level for individual effects)
2. native runtime telemetry
3. aggregated frame health
4. power and thermal state
5. accessibility settings
6. hysteresis

There is no Snapdragon / Exynos / Tensor / GPU-name table.

## Tiers

| Tier | Intent |
| --- | --- |
| `full` | Sustaining the requested UI workload. Springs, glass/blur where safe, Orb deformation, limited secondary motion. |
| `standard` | Default production experience. Springs, task/navigation/Orb, small blur/glass. No ornamental parallax. |
| `reduced` | Persistent jank, power/thermal pressure, or low-RAM ceiling. Opacity, short transforms, static surfaces. |
| `minimal` | Reduce Motion, critical thermal, or severe sustained jank. Opacity, tiny scale, haptics, immediate state. |

`minimal` is still AETHER. It is not an unstyled fallback.

## Native module

`modules/aether-motion` is a local Expo module named `AetherMotion`.

Snapshot interval: **750 ms**.

Warm-up after start/foreground: **2500 ms**. Startup frames are not treated as
steady-state.

### Android

- `JankStats` on the active window
- Display refresh rate (not assumed 60 Hz)
- `PowerManager` thermal status on API 29+
- Power Saver broadcast
- `ActivityManager.isLowRamDevice()` as a coarse ceiling
- `MemoryInfo.lowMemory` only when emitting a snapshot

API level can disable a specific blur implementation. It does not select the
motion tier.

### iOS / iPadOS

- One `CADisplayLink` for the motion subsystem
- `UIScreen.maximumFramesPerSecond`
- `ProcessInfo.thermalState`
- Low Power Mode
- Memory warning as a boolean, not a poll

`CADisableMinimumFrameDurationOnPhone` is declared through the module config
plugin so the OS may use supported ProMotion rates. 120 Hz is never claimed.

## Hysteresis

| Constant | Value | Meaning |
| --- | --- | --- |
| `MOTION_SNAPSHOT_INTERVAL_MS` | 750 | Native aggregate interval |
| `MOTION_WARMUP_MS` | 2500 | Ignore frame health after resume |
| `MOTION_DOWNGRADE_WINDOWS` | 2 | Consecutive bad windows to step down |
| `MOTION_RECOVERY_WINDOWS` | 27 | ~20.25 s of healthy windows to step up |
| `MOTION_JANK_FULL_TO_STANDARD` | 0.08 | Full → standard |
| `MOTION_JANK_STANDARD_TO_REDUCED` | 0.18 | Standard → reduced |
| `MOTION_JANK_REDUCED_TO_MINIMAL` | 0.35 | Reduced → minimal |

Downgrade is one tier at a time. Upgrade is slower and cannot pass the current
ceiling.

Immediate overrides:

- Reduce Motion → `minimal`
- Thermal `severe` / `critical` / `emergency` / `shutdown` → `minimal`

## Accessibility

Accessibility wins over `full`.

- Reduce Motion forces `minimal` and stays there even if frames recover.
- Reduce Transparency disables live blur and iOS glass.
- Cross-fade preference is recorded for navigation consumers.

## Android blur

`AdaptiveBlur` is the only `BlurView` owner.

- API ≤ 30: no expensive compatibility blur on animation-heavy surfaces.
  Semantic translucent AETHER surface instead.
- API ≥ 31: `dimezisBlurView` only with a sibling `BlurTargetView`, a
  permitted tier, and no Reduce Transparency.
- Reduced/minimal or sustained degradation: blur off, same surface identity.

Blur intensity is not animated.

## iOS glass

`AdaptiveGlass` uses `expo-glass-effect` only after
`isGlassEffectAPIAvailable()` and `isLiquidGlassAvailable()`. It does not fade
the glass parent through opacity. Older iOS uses `expo-blur` or a translucent
surface.

## Reanimated flags

Installed `react-native-reanimated@4.5.1` defaults:

- `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS`: false
- `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS`: false
- `USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS`: true
- `DISABLE_COMMIT_PAUSING_MECHANISM`: false
- `ENABLE_SHARED_ELEMENT_TRANSITIONS`: false
- `USE_ANIMATION_BACKEND`: false

This work does not flip experimental flags. Synchronous transform updates can
change hit-testing. Correctness stays ahead of labels.

## Failure behavior

If `AetherMotion` is missing:

- the app starts
- the profile is conservative `standard`
- accessibility still applies
- glass/blur policy stays safe
- no startup dependency and no warning spam

Malformed snapshots are ignored field-by-field.

## Diagnostics

Development-only `MotionDiagnosticsCard` on Settings. Production does not
mount it. Raw snapshots never update the main React tree.

## Test strategy

Pure Bun tests cover:

- initial ceiling
- frame budget math
- hysteresis
- every thermal mapping
- power saver
- accessibility
- Android blur policy
- native snapshot validation
- presets
- architecture guards (no SoC tables, no raw `BlurView`, no per-frame bridge)

Kotlin JVM tests cover thermal mapping and bounded frame aggregation.

Swift XCTest sources exist for the same mapping/aggregation. They are not a
substitute for an Xcode run.

## Physical validation still required

Unit tests do not measure real FPS, jank, thermals, or ProMotion. See
[`KNOWN_TRADEOFFS.md`](KNOWN_TRADEOFFS.md) for the open device gates.
