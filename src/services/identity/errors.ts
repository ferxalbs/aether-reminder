export type IdentityErrorCode =
  | "CONFIGURATION"
  | "STORAGE_UNAVAILABLE"
  | "BOOTSTRAP_FAILED"
  | "SESSION_UNAVAILABLE"
  | "LINK_FAILED";

export class IdentityError extends Error {
  readonly code: IdentityErrorCode;

  constructor(code: IdentityErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "IdentityError";
    this.code = code;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export function isIdentityError(error: unknown): error is IdentityError {
  return error instanceof IdentityError;
}
