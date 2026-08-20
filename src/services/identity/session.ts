import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from "@supabase/supabase-js";
import { IdentityError } from "./errors";
import type {
  IdentityListener,
  IdentitySessionService,
  IdentitySnapshot,
} from "./types";

type AuthClient = SupabaseClient["auth"];

function sessionSnapshot(session: Session | null): IdentitySnapshot {
  if (!session) return { status: "signed_out", expiresAt: null };
  return {
    status: session.user.is_anonymous ? "anonymous" : "authenticated",
    expiresAt: session.expires_at ? session.expires_at * 1000 : null,
  };
}

function providerError(
  code: "BOOTSTRAP_FAILED" | "SESSION_UNAVAILABLE" | "LINK_FAILED",
  action: string,
  error: unknown,
): IdentityError {
  return new IdentityError(code, `Supabase Auth ${action} failed.`, error);
}

export class AetherIdentitySessionService implements IdentitySessionService {
  private initialization: Promise<IdentitySnapshot> | null = null;
  private providerSession: Session | null = null;
  private snapshot: IdentitySnapshot = {
    status: "loading",
    expiresAt: null,
  };
  private readonly listeners = new Set<IdentityListener>();
  private unsubscribeAuth: (() => void) | null = null;

  constructor(private readonly auth: AuthClient) {}

  async initialize(): Promise<IdentitySnapshot> {
    if (this.initialization) return this.initialization;
    this.initialization = this.bootstrap();
    try {
      return await this.initialization;
    } catch (error) {
      this.initialization = null;
      this.setProviderSession(null);
      this.setSnapshot({ status: "error", expiresAt: null });
      throw error;
    }
  }

  getSnapshot(): IdentitySnapshot {
    return { ...this.snapshot };
  }

  subscribe(listener: IdentityListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  async getAccessToken(): Promise<string> {
    await this.initialize();
    let session = this.providerSession;
    const expiresSoon =
      !session?.expires_at || session.expires_at * 1000 <= Date.now() + 30_000;

    if (expiresSoon) {
      let refreshed;
      try {
        refreshed = await this.auth.refreshSession();
      } catch (error) {
        throw providerError("SESSION_UNAVAILABLE", "session refresh", error);
      }
      if (refreshed.error || !refreshed.data.session) {
        throw providerError(
          "SESSION_UNAVAILABLE",
          "session refresh",
          refreshed.error,
        );
      }
      this.setProviderSession(refreshed.data.session);
      session = refreshed.data.session;
    }

    if (!session?.access_token) {
      throw new IdentityError(
        "SESSION_UNAVAILABLE",
        "AETHER does not have an authenticated session.",
      );
    }
    return session.access_token;
  }

  async linkEmail(email: string): Promise<void> {
    await this.initialize();
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new IdentityError("LINK_FAILED", "A valid email is required.");
    }
    try {
      const result = await this.auth.updateUser({ email: normalizedEmail });
      if (result.error) {
        throw providerError("LINK_FAILED", "email linking", result.error);
      }
    } catch (error) {
      if (error instanceof IdentityError) throw error;
      throw providerError("LINK_FAILED", "email linking", error);
    }
  }

  private async bootstrap(): Promise<IdentitySnapshot> {
    let current;
    try {
      current = await this.auth.getSession();
    } catch (error) {
      throw providerError("BOOTSTRAP_FAILED", "session recovery", error);
    }
    if (current.error) {
      throw providerError(
        "BOOTSTRAP_FAILED",
        "session recovery",
        current.error,
      );
    }

    let session = current.data.session;
    if (!session) {
      let anonymous;
      try {
        anonymous = await this.auth.signInAnonymously();
      } catch (error) {
        throw providerError("BOOTSTRAP_FAILED", "anonymous sign-in", error);
      }
      if (anonymous.error || !anonymous.data.session) {
        throw providerError(
          "BOOTSTRAP_FAILED",
          "anonymous sign-in",
          anonymous.error,
        );
      }
      session = anonymous.data.session;
    }

    this.setProviderSession(session);
    const authSubscription = this.auth.onAuthStateChange(
      (_event: AuthChangeEvent, nextSession: Session | null) => {
        // Keep this callback synchronous. Any network operation belongs outside
        // the Supabase auth state-change callback to avoid lock contention.
        this.setProviderSession(nextSession);
      },
    );
    this.unsubscribeAuth = () =>
      authSubscription.data.subscription.unsubscribe();
    return this.getSnapshot();
  }

  private setProviderSession(session: Session | null): void {
    this.providerSession = session;
    this.setSnapshot(sessionSnapshot(session));
  }

  private setSnapshot(snapshot: IdentitySnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(this.getSnapshot());
  }

  dispose(): void {
    this.unsubscribeAuth?.();
    this.unsubscribeAuth = null;
    this.initialization = null;
    this.providerSession = null;
    this.setSnapshot({ status: "loading", expiresAt: null });
  }
}

let sharedSessionService: AetherIdentitySessionService | null = null;

export async function getIdentitySessionService(): Promise<AetherIdentitySessionService> {
  if (!sharedSessionService) {
    const { getAetherSupabaseClient } = await import("./client");
    sharedSessionService = new AetherIdentitySessionService(
      getAetherSupabaseClient().auth,
    );
  }
  return sharedSessionService;
}

export function resetIdentitySessionServiceForTests(): void {
  sharedSessionService?.dispose();
  sharedSessionService = null;
}
