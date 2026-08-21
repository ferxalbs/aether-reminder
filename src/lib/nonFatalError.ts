const SECRET_PATTERNS = [
  /Bearer\s+[^\s]+/gi,
  /\b(?:sk|pk|rk|ek)[-_][A-Za-z0-9_-]{8,}\b/g,
  /\b(?:api[_-]?key|authorization|secret|token)\s*[:=]\s*[^\s,]+/gi,
];

export function sanitizeErrorForLogging(error: unknown): string {
  const raw =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "string"
        ? error
        : "Unknown error";

  return SECRET_PATTERNS.reduce(
    (message, pattern) => message.replace(pattern, "[redacted]"),
    raw,
  ).slice(0, 240);
}

export function reportNonFatalError(scope: string, error: unknown): void {
  const safeScope = scope.slice(0, 96);
  const details: Record<string, string | number> = {
    scope: safeScope,
    error: sanitizeErrorForLogging(error),
  };
  if (error && typeof error === "object") {
    const diagnostic = error as Record<string, unknown>;
    if (typeof diagnostic.code === "string") {
      details.code = diagnostic.code.slice(0, 96);
    }
    if (
      typeof diagnostic.status === "number" &&
      Number.isFinite(diagnostic.status)
    ) {
      details.status = diagnostic.status;
    }
    if (typeof diagnostic.requestId === "string") {
      details.requestId = diagnostic.requestId.slice(0, 128);
    }
    if (
      typeof diagnostic.retryAfterSeconds === "number" &&
      Number.isFinite(diagnostic.retryAfterSeconds)
    ) {
      details.retryAfterSeconds = diagnostic.retryAfterSeconds;
    }
  }
  console.warn(`[Aether:${safeScope}] ${JSON.stringify(details)}`);
}
