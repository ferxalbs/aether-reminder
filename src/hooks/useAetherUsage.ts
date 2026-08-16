import { useCallback, useEffect, useState } from "react";
import {
  AetherCloudError,
  getAetherCloudClient,
  getCommercialPolicy,
  isAetherCloudConfigured,
  type AetherUsageSnapshot,
} from "@/services/cloud";
import { reportNonFatalError } from "@/lib/nonFatalError";

export type UsageFetchState =
  | "loading"
  | "loaded"
  | "offline"
  | "unconfigured"
  | "unauthorized"
  | "error";

export type UsagePlanPreview = {
  tier: "free" | "pro";
  displayName: string;
};

export interface UseAetherUsageResult {
  snapshot: AetherUsageSnapshot | null;
  plan: UsagePlanPreview | null;
  state: UsageFetchState;
  errorMessage: string | null;
  refresh: () => Promise<void>;
}

export function useAetherUsage(): UseAetherUsageResult {
  const [snapshot, setSnapshot] = useState<AetherUsageSnapshot | null>(null);
  const [plan, setPlan] = useState<UsagePlanPreview | null>(null);
  const [state, setState] = useState<UsageFetchState>(() =>
    isAetherCloudConfigured() ? "loading" : "unconfigured",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    if (!isAetherCloudConfigured()) {
      setState("unconfigured");
      setSnapshot(null);
      setPlan(null);
      setErrorMessage(null);
      return;
    }

    setState("loading");
    setErrorMessage(null);

    try {
      const client = getAetherCloudClient();
      const subscription = await getCommercialPolicy(undefined, client);
      setPlan({
        tier: subscription.policy.tier,
        displayName:
          subscription.policy.tier === "pro" ? "AETHER Pro" : "AETHER Free",
      });
      const result = await client.getUsage();
      setSnapshot(result);
      setPlan({ tier: result.plan.tier, displayName: result.plan.displayName });
      setState("loaded");
    } catch (caught) {
      reportNonFatalError("fetch-usage", caught);
      setSnapshot(null);
      if (caught instanceof AetherCloudError && caught.code === "UNAUTHORIZED") {
        setState("unauthorized");
        setErrorMessage("Sign in is required to refresh hosted usage.");
      } else if (
        caught instanceof AetherCloudError &&
        (caught.code === "NETWORK_ERROR" || caught.code === "TIMEOUT")
      ) {
        setState("offline");
        setErrorMessage(
          "Could not refresh usage. Local reminders remain fully available.",
        );
      } else {
        setState("error");
        setErrorMessage(
          "Usage details are temporarily unavailable from AETHER Cloud.",
        );
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchUsage();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchUsage]);

  return {
    snapshot,
    plan,
    state,
    errorMessage,
    refresh: fetchUsage,
  };
}
