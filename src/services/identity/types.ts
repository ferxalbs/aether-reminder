export type IdentityStatus =
  "loading" | "anonymous" | "authenticated" | "signed_out" | "error";

export type IdentitySnapshot = {
  status: IdentityStatus;
  expiresAt: number | null;
};

/** The only auth capability the Cloud client needs from the identity layer. */
export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
}

export type IdentityListener = (snapshot: IdentitySnapshot) => void;

export interface IdentitySessionService extends AccessTokenProvider {
  initialize(): Promise<IdentitySnapshot>;
  getSnapshot(): IdentitySnapshot;
  subscribe(listener: IdentityListener): () => void;
  linkEmail(email: string): Promise<void>;
}
