export {
  assertProductionSupabaseAuthConfig,
  publicSupabaseEnvSnapshot,
  resolveSupabaseAuthConfig,
  type SupabaseAuthConfig,
} from "./config";
export {
  getAetherSupabaseClient,
  resetAetherSupabaseClientForTests,
} from "./client";
export {
  getIdentitySessionService,
  AetherIdentitySessionService,
  resetIdentitySessionServiceForTests,
} from "./session";
export {
  DeviceIdentityStore,
  getDeviceIdentityStore,
  resetDeviceIdentityStoreForTests,
  type SecureStringStore,
} from "./device";
export {
  IdentityError,
  isIdentityError,
  type IdentityErrorCode,
} from "./errors";
export type {
  AccessTokenProvider,
  IdentityListener,
  IdentitySessionService,
  IdentitySnapshot,
  IdentityStatus,
} from "./types";
