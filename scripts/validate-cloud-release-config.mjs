const isEasBuild = process.argv.includes("--eas");
const mustValidate =
  !isEasBuild || process.env.EAS_BUILD_PROFILE === "production";

if (!mustValidate) process.exit(0);

const rawOrigin = process.env.EXPO_PUBLIC_AETHER_CLOUD_URL?.trim() ?? "";
if (!rawOrigin) {
  throw new Error(
    "EXPO_PUBLIC_AETHER_CLOUD_URL is required for a production AETHER Reminder build.",
  );
}

let origin;
try {
  origin = new URL(rawOrigin);
} catch {
  throw new Error("EXPO_PUBLIC_AETHER_CLOUD_URL must be a valid HTTPS URL.");
}

if (origin.protocol !== "https:") {
  throw new Error("Production AETHER Cloud origin must use HTTPS.");
}
