import path from "node:path";
import {
	getCloudflareApiEnvironmentFromEnv,
	getGlobalConfigPath,
} from "@cloudflare/workers-utils";
import type { ConfigFileLocation } from "./file-storage";

/**
 * The subdirectory (under the global config directory) that holds the user
 * auth config file.
 */
const USER_AUTH_CONFIG_PATH = "config";

/**
 * The absolute path to wrangler's auth config TOML file, under the global config
 * directory (which honours `CLOUDFLARE_CONFIG_DIR`). Named `default.toml` in
 * production, or `<environment>.toml` for the staging / other Cloudflare API
 * environments.
 */
export function getAuthConfigFilePath(): string {
	const environment = getCloudflareApiEnvironmentFromEnv();
	const fileName =
		environment === "production" ? "default.toml" : `${environment}.toml`;
	return path.join(getGlobalConfigPath(), USER_AUTH_CONFIG_PATH, fileName);
}

/**
 * Wrangler's default auth-config {@link ConfigFileLocation}: a TOML file on disk
 * under the global config directory.
 *
 * Shared so that delegated tools (e.g. `@cloudflare/remote-bindings`) read and
 * refresh the very same OAuth token the top-level CLI persisted, without
 * depending on wrangler.
 */
export function defaultAuthConfigLocation(): ConfigFileLocation {
	return { getPath: getAuthConfigFilePath, format: "toml" };
}
