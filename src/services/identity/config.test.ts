import { describe, expect, test } from "bun:test";
import {
  assertProductionSupabaseAuthConfig,
  resolveSupabaseAuthConfig,
} from "./config";

describe("Supabase Auth configuration", () => {
  test("requires public URL and publishable key", () => {
    expect(resolveSupabaseAuthConfig({})).toBeNull();
    expect(() => assertProductionSupabaseAuthConfig({})).toThrow(
      "EXPO_PUBLIC_SUPABASE_URL",
    );
  });

  test("allows local HTTP only outside release builds", () => {
    const development = resolveSupabaseAuthConfig(
      {
        EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      },
      false,
    );
    expect(development?.url).toBe("http://127.0.0.1:54321");
    expect(
      resolveSupabaseAuthConfig(
        {
          EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
          EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
        },
        true,
      ),
    ).toBeNull();
  });

  test("accepts HTTPS production configuration without exposing the key", () => {
    const config = assertProductionSupabaseAuthConfig({
      EXPO_PUBLIC_SUPABASE_URL: "https://project.supabase.co/",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    });
    expect(config).toEqual({
      url: "https://project.supabase.co",
      publishableKey: "sb_publishable_test",
    });
  });
});
