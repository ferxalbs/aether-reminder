export const ANDROID_BLUR_SCALE_FACTORS = [1, 2, 4] as const;
export type AndroidBlurScale = (typeof ANDROID_BLUR_SCALE_FACTORS)[number];

export const ANDROID_BLUR_SCALE_DEFAULT: AndroidBlurScale = 4;

export function parseAndroidBlurScale(
  rawValue: string | undefined,
): AndroidBlurScale | null {
  switch (rawValue) {
    case "1":
      return 1;
    case "2":
      return 2;
    case "4":
      return 4;
    default:
      return null;
  }
}

function isDevelopmentBuild(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

/**
 * The diagnostic selector is intentionally inert in release builds. The
 * product renderer remains at the existing 4f behavior until device evidence
 * justifies a production change.
 */
export function resolveAndroidBlurScale(
  rawValue: string | undefined = process.env.EXPO_PUBLIC_AETHER_BLUR_SCALE,
  development = isDevelopmentBuild(),
): AndroidBlurScale {
  if (!development) return ANDROID_BLUR_SCALE_DEFAULT;
  return parseAndroidBlurScale(rawValue) ?? ANDROID_BLUR_SCALE_DEFAULT;
}
