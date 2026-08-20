import { describe, expect, test } from "bun:test";
import type { Session } from "@supabase/supabase-js";
import { IdentityError } from "./errors";
import { AetherIdentitySessionService } from "./session";

type AuthPort = ConstructorParameters<typeof AetherIdentitySessionService>[0];

function makeSession(
  overrides: Partial<{
    access_token: string;
    expires_at: number;
    is_anonymous: boolean;
  }> = {},
): Session {
  return {
    access_token: overrides.access_token ?? "access-token",
    refresh_token: "refresh-token",
    expires_in: 3600,
    expires_at: overrides.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: "provider-subject",
      aud: "authenticated",
      role: "authenticated",
      email: undefined,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date(0).toISOString(),
      is_anonymous: overrides.is_anonymous ?? true,
    },
  };
}

function makeAuth(
  options: {
    session?: Session | null;
    anonymous?: Session | null;
    refreshed?: Session | null;
    sessionError?: Error | null;
  } = {},
): {
  auth: AuthPort;
  calls: { anonymous: number; refresh: number; updatedEmail?: string };
} {
  const calls = {
    anonymous: 0,
    refresh: 0,
    updatedEmail: undefined as string | undefined,
  };
  const auth = {
    async getSession() {
      return {
        data: { session: options.session ?? null },
        error: options.sessionError ?? null,
      };
    },
    async signInAnonymously() {
      calls.anonymous += 1;
      return {
        data: { session: options.anonymous ?? makeSession() },
        error: null,
      };
    },
    async refreshSession() {
      calls.refresh += 1;
      return {
        data: {
          session: options.refreshed ?? makeSession({ is_anonymous: false }),
        },
        error: null,
      };
    },
    async updateUser(attributes: { email?: string }) {
      calls.updatedEmail = attributes.email;
      return { data: { user: null }, error: null };
    },
    onAuthStateChange(next: (event: string, session: Session | null) => void) {
      void next;
      return { data: { subscription: { unsubscribe: () => undefined } } };
    },
  } as unknown as AuthPort;
  return { auth, calls };
}

describe("AETHER identity session", () => {
  test("creates one anonymous authenticated session when storage has none", async () => {
    const { auth, calls } = makeAuth({ session: null });
    const service = new AetherIdentitySessionService(auth);

    await expect(service.initialize()).resolves.toMatchObject({
      status: "anonymous",
    });
    await expect(service.getAccessToken()).resolves.toBe("access-token");
    await expect(service.initialize()).resolves.toMatchObject({
      status: "anonymous",
    });
    expect(calls.anonymous).toBe(1);
  });

  test("reuses a persisted permanent session and does not create an anonymous user", async () => {
    const session = makeSession({ is_anonymous: false });
    const { auth, calls } = makeAuth({ session });
    const service = new AetherIdentitySessionService(auth);

    await expect(service.initialize()).resolves.toMatchObject({
      status: "authenticated",
    });
    expect(calls.anonymous).toBe(0);
  });

  test("refreshes a near-expiry session through the abstraction", async () => {
    const { auth, calls } = makeAuth({
      session: makeSession({ expires_at: Math.floor(Date.now() / 1000) + 1 }),
      refreshed: makeSession({
        access_token: "refreshed-token",
        is_anonymous: false,
      }),
    });
    const service = new AetherIdentitySessionService(auth);

    await expect(service.getAccessToken()).resolves.toBe("refreshed-token");
    expect(calls.refresh).toBe(1);
    expect(service.getSnapshot().status).toBe("authenticated");
  });

  test("starts email identity linking without changing the session service", async () => {
    const { auth, calls } = makeAuth({ session: makeSession() });
    const service = new AetherIdentitySessionService(auth);

    await service.linkEmail("  person@example.com ");
    expect(calls.updatedEmail).toBe("person@example.com");
  });

  test("never falls back to development identity when anonymous bootstrap fails", async () => {
    const { auth } = makeAuth({
      session: null,
      anonymous: null,
    });
    const failingAuth = {
      ...auth,
      signInAnonymously: async () => ({
        data: { session: null },
        error: new Error("anonymous sign-in disabled"),
      }),
    } as unknown as AuthPort;
    const service = new AetherIdentitySessionService(failingAuth);

    await expect(service.initialize()).rejects.toBeInstanceOf(IdentityError);
    await expect(service.initialize()).rejects.toMatchObject({
      code: "BOOTSTRAP_FAILED",
    });
  });
});
