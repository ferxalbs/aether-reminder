# Android blur scale diagnostic

This diagnostic compares Dimezis BlurView snapshot scale factors on supported
Android API 31+ devices. It does not choose a production renderer value and it
does not appear in normal settings or product UX.

## Build selection

Use the existing Expo public-development environment convention when starting a
development build:

```text
EXPO_PUBLIC_AETHER_BLUR_SCALE=4
EXPO_PUBLIC_AETHER_BLUR_SCALE=2
EXPO_PUBLIC_AETHER_BLUR_SCALE=1
```

The selector accepts only the exact strings `1`, `2`, and `4`. It is read only
when `__DEV__` is true. Release builds always resolve to the current production
default, 4f, even if an environment value is present. The value is not persisted
as a user setting.

## Native renderer invariant

The Android diagnostic view reuses the Dimezis 3.2.0 dependency and the same
non-recursive AETHER blur-target topology. Its only renderer variable is the
scale factor:

| Diagnostic value | Native call                    |
| ---------------- | ------------------------------ |
| 4f               | `setupWith(target, 4f, false)` |
| 2f               | `setupWith(target, 2f, false)` |
| 1f               | `setupWith(target, 1f, false)` |

The final argument is `applyNoise=false` for every variant. Blur radius remains
`intensity / 4f`, tint and overlay mapping remain unchanged, and the same
target, layout, clipping, background, and motion are used.

## Physical comparison procedure

Run all three comparisons on the same physical Android device running the same
API 31+ Android version:

1. Use the same AETHER development build variant and package. Change only
   `EXPO_PUBLIC_AETHER_BLUR_SCALE`, rebuild/reinstall, and clear the app state
   only if required to reproduce the exact same launch state.
2. Open the same AETHER screen and assistant overlay. Use the same theme,
   brightness, blur intensity, tint, overlay, geometry, and animation state.
3. Reproduce the same underlying route content and scroll position. Pause at a
   stable frame before capture; do not compare during an opening, closing, or
   scrolling animation.
4. Capture a native Android screenshot with the same command and crop for each
   value; do not photograph the display:

   ```bash
   adb exec-out screencap -p > blur-scale-4.png
   adb exec-out screencap -p > blur-scale-2.png
   adb exec-out screencap -p > blur-scale-1.png
   ```

5. Record the device model, Android version, build identifier, theme, screen,
   scroll position, overlay geometry, and capture timestamp beside the images.

Inspect each screenshot for:

- micro-dot or grain pattern;
- gradient smoothness;
- sampling blocks;
- edge aliasing;
- edge flicker across repeated captures;
- stale-frame artifacts;
- transparency corruption;
- black pixels or black frames; and
- blur consistency around rounded corners.

## Performance comparison

For each scale factor, capture a short idle interval and a repeated assistant
open/close plus scroll interval. Prefer Android Studio Profiler or Profileable
rendering data. When only platform tools are available, collect the same
commands for each build and preserve the raw output:

```bash
adb shell dumpsys gfxinfo com.ferxalbs.aetherreminder framestats > gfxinfo-4.txt
adb shell dumpsys meminfo com.ferxalbs.aetherreminder > meminfo-4.txt
adb logcat -d -v threadtime -s AndroidRuntime:W ReactNative:W ReactNativeJS:W \
  Reanimated:W AetherMotion:W > logcat-4.txt
```

Use matching `-2` and `-1` filenames for the other variants. Record frame
timings, jank/frame drops, render-thread warnings, logcat anomalies, and any
material memory change. Do not infer GPU cost from screenshot appearance.

## Decision matrix

- If 4f has artifacts, 2f and 1f do not, and 2f performance is healthy,
  prefer 2f.
- If 4f and 2f have artifacts, 1f does not, and 1f performance is healthy,
  prefer 1f.
- If all three have essentially the same artifact, scale factor is not the
  root cause. Continue with tint/overlay alpha, framebuffer transparency,
  RenderEffect output, clipping/composition, underlying target content, and
  OEM/GPU investigation only after renderer causes are excluded.
- If smaller factors reduce artifacts but create unacceptable jank or GPU cost,
  do not ship an unstable renderer; investigate alternate native composition or
  renderer configuration.

Until this procedure is completed with visual and performance evidence, AETHER
production remains at 4f. A simulator, unit test, bundle, or native compile does
not establish the visual root cause.
