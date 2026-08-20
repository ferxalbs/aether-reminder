import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import {
  createClient,
  processLock,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { IdentityError } from "./errors";
import { resolveSupabaseAuthConfig } from "./config";

let sharedClient: SupabaseClient | null = null;
let autoRefreshSubscription: { remove: () => void } | null = null;

export function getAetherSupabaseClient(): SupabaseClient {
  if (sharedClient) return sharedClient;

  const config = resolveSupabaseAuthConfig();
  if (!config) {
    throw new IdentityError(
      "CONFIGURATION",
      "Supabase Auth is not configured for this AETHER build.",
    );
  }

  sharedClient = createClient(config.url, config.publishableKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  });

  if (!autoRefreshSubscription) {
    autoRefreshSubscription = AppState.addEventListener("change", (state) => {
      if (!sharedClient) return;
      if (state === "active") void sharedClient.auth.startAutoRefresh();
      else void sharedClient.auth.stopAutoRefresh();
    });
    if (AppState.currentState === "active") {
      void sharedClient.auth.startAutoRefresh();
    }
  }

  return sharedClient;
}

export function resetAetherSupabaseClientForTests(): void {
  autoRefreshSubscription?.remove();
  autoRefreshSubscription = null;
  sharedClient = null;
}
