import { useEffect } from "react";
import { AppState } from "react-native";
import { useLocalAppBootstrap } from "./LocalAppBootstrap";
import { isAetherCloudConfigured } from "@/services/cloud/config";
import { bootstrapCloudIdentity } from "@/services/cloud/bootstrap";
import { getAetherCloudClient } from "@/services/cloud/client";
import { bindRevenueCatAccount } from "@/services/revenuecat/bootstrap";
import { reportNonFatalError } from "@/lib/nonFatalError";

/**
 * Restores the hosted capability identity after local data is usable.
 *
 * This boundary deliberately does not activate multi-device synchronization.
 * Cloud identity and device registration remain required for protected hosted
 * AI, voice authorization, usage enforcement, and RevenueCat account binding.
 */
export function HostedServicesBootstrap() {
  const { phase } = useLocalAppBootstrap();

  useEffect(() => {
    if (phase !== "ready" || !isAetherCloudConfigured()) return;

    let disposed = false;
    let appActive = AppState.currentState === "active";
    let retryAttempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let inFlight: Promise<void> | null = null;

    const clearRetry = () => {
      if (retryTimer === null) return;
      clearTimeout(retryTimer);
      retryTimer = null;
    };

    const bootstrap = (): Promise<void> => {
      if (inFlight) return inFlight;
      const operation = (async () => {
        const { accountId } = await bootstrapCloudIdentity(
          getAetherCloudClient(),
        );
        await bindRevenueCatAccount(accountId);
      })();
      inFlight = operation;
      const clearInFlight = () => {
        if (inFlight === operation) inFlight = null;
      };
      operation.then(clearInFlight, clearInFlight);
      return operation;
    };

    const scheduleRetry = () => {
      if (disposed || !appActive || retryTimer !== null) return;
      const delayMs = Math.min(60_000, 1_000 * 2 ** Math.min(retryAttempt, 6));
      retryAttempt = Math.min(retryAttempt + 1, 6);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void attemptBootstrap();
      }, delayMs);
    };

    const attemptBootstrap = async () => {
      if (disposed || !appActive) return;
      clearRetry();
      try {
        await bootstrap();
        retryAttempt = 0;
      } catch (error: unknown) {
        if (disposed || !appActive) return;
        reportNonFatalError("cloud-identity-bootstrap", error);
        scheduleRetry();
      }
    };

    const subscription = AppState.addEventListener("change", (state) => {
      appActive = state === "active";
      if (!appActive) {
        clearRetry();
        return;
      }
      retryAttempt = 0;
      void attemptBootstrap();
    });

    void attemptBootstrap();

    return () => {
      disposed = true;
      appActive = false;
      clearRetry();
      subscription.remove();
    };
  }, [phase]);

  return null;
}
