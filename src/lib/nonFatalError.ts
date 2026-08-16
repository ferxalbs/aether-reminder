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
  console.warn(`[Aether:${scope}] ${sanitizeErrorForLogging(error)}`);
}
