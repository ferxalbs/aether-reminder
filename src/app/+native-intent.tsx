/**
 * Native links express navigation intent only. Private capture payloads travel
 * through the dedicated inbox and never through URL parameters.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    const url = new URL(path, "aether://app");
    const route =
      url.protocol === "aether:"
        ? url.hostname
        : url.pathname.replace(/^\//, "");
    if (route === "capture" || url.pathname === "/capture") return "/capture";
    return path.startsWith("/") ? path : "/";
  } catch {
    return "/";
  }
}
