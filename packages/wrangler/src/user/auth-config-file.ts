import {
	createFileStorage,
	defaultAuthConfigLocation,
	getAuthConfigFilePath,
} from "@cloudflare/workers-auth";
import type { UserAuthConfig } from "@cloudflare/workers-auth";

/**
 * Re-export the shared auth-config location helpers from
 * `@cloudflare/workers-auth`. Consumers configure only *where* (and in what
 * format) the auth file lives — workers-auth owns the actual file I/O — so
 * wrangler and `@cloudflare/remote-bindings` resolve the same on-disk location.
 */
export { defaultAuthConfigLocation, getAuthConfigFilePath };

/**
 * Writes the user auth config to disk.
 *
 * No in-memory cache to invalidate — auth state is read on demand by every call
 * site that needs it. Callers are responsible for any consumer-side cache
 * purging (e.g. via the `OAuthFlowContext.purgeOnLoginOrLogout` hook).
 */
export function writeAuthConfigFile(config: UserAuthConfig): void {
	createFileStorage<UserAuthConfig>(defaultAuthConfigLocation()).write(config);
}

/**
 * Reads the user auth config from disk.
 *
 * @throws if the file does not exist or cannot be parsed as TOML. Callers
 * typically catch this and treat the failure as "not logged in via local OAuth".
 */
export function readAuthConfigFile(): UserAuthConfig {
	return createFileStorage<UserAuthConfig>(defaultAuthConfigLocation()).read();
}
