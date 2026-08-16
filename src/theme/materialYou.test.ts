import { describe, expect, mock, test } from "bun:test";
import type { Material3ColorRoles } from "./types";

let platform = "android";
let calls: Record<string, unknown>[] = [];

mock.module("react-native", () => ({
  Platform: {
    get OS() {
      return platform;
    },
  },
  AppState: {
    addEventListener: () => ({ remove: () => undefined }),
  },
}));

const palette: Material3ColorRoles = {
  primary: "#A00020",
  onPrimary: "#FFFFFF",
  primaryContainer: "#FFD9DF",
  onPrimaryContainer: "#40000A",
};

const nativeMaterialColorsModule = {
  isDynamicColorAvailable: true,
  Switch: () => null,
  getMaterialColors: (options: Record<string, unknown>) => {
    calls.push(options);
    return palette;
  },
};

mock.module("@expo/ui/jetpack-compose", () => nativeMaterialColorsModule);

const { getAndroidMaterialColors, isAndroidDynamicColorAvailable } =
  await import("./materialYou");

describe("Android Material You palette bridge", () => {
  test("reads the wallpaper path without supplying a seed", () => {
    platform = "android";
    nativeMaterialColorsModule.isDynamicColorAvailable = true;
    calls = [];

    expect(isAndroidDynamicColorAvailable()).toBe(true);
    expect(getAndroidMaterialColors("dark")).toEqual(palette);
    expect(calls).toEqual([{ scheme: "dark" }]);
    expect(calls[0]).not.toHaveProperty("seedColor");
  });

  test("does not expose Android Material You on Apple platforms", () => {
    platform = "ios";
    nativeMaterialColorsModule.isDynamicColorAvailable = true;

    expect(isAndroidDynamicColorAvailable()).toBe(false);
    expect(getAndroidMaterialColors("light")).toBeNull();
  });
});
