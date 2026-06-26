// Public surface of @cloudflare/workers-auth.
//
// Consumers typically wire up a single `createOAuthFlow(ctx)` instance and
// then call its methods. The pure helpers exported here are useful when the
// consumer needs to read/write the auth state directly (e.g. wrangler's
// `getAPIToken` resolver), or to inject deterministic implementations into
// tests.

export type { ConfigStorage } from "./config-file";
export type { AuthConfigStorage, UserAuthConfig } from "./config-file/auth";

// Auth storage is configured by a `ConfigFileLocation` (path + format) —
// workers-auth owns the file I/O. Both fields are plain values, so a CLI can
// configure them entirely from environment variables (no storage object to
// inject). `createOAuthFlow` / `createEnvApiTokenResolver` take a location;
// `createFileStorage(location)` builds a read/write storage for consumers that
// need direct access (e.g. `readStoredAuthState`).
export { createFileStorage } from "./config-file/file-storage";
export type {
	ConfigFileLocation,
	StorageFileFormat,
} from "./config-file/file-storage";

export {
	defaultAuthConfigLocation,
	getAuthConfigFilePath,
} from "./config-file/default-auth-storage";
export {
	getAuthFromEnv,
	getCloudflareAPITokenFromEnv,
	getCloudflareGlobalAuthEmailFromEnv,
	getCloudflareGlobalAuthKeyFromEnv,
} from "./credentials";

export { createEnvApiTokenResolver } from "./credentials-resolver";
export type { EnvApiTokenResolverOptions } from "./credentials-resolver";

export {
	clearAccessCaches,
	domainUsesAccess,
	getAccessHeaders,
} from "./access";

export { getAuthUrlFromEnv, getClientIdFromEnv } from "./env-vars";

export { createOAuthFlow } from "./flow";
export type {
	LoginOrRefreshFailureReason,
	LoginOrRefreshResult,
	LoginProps,
	OAuthFlowAPI,
} from "./flow";

export type {
	OAuthConsentPages,
	OAuthFlowContext,
	OAuthFlowLogger,
	OAuthFlowTemporaryContext,
} from "./context";

export { normalizeLogger } from "./logger";

export { generateAuthUrl } from "./generate-auth-url";

export { generateRandomState } from "./generate-random-state";
export { TEMPORARY_TERMS_NOTICE, TEMPORARY_TERMS_PROMPT } from "./temporary";
export { PKCE_CHARSET } from "./pkce";

export { readStoredAuthState } from "./state";

export type { TemporaryPreviewAccount } from "./config-file/temporary";
