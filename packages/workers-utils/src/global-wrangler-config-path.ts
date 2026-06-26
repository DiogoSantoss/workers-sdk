import os from "node:os";
import path from "node:path";
import xdgAppPaths from "xdg-app-paths";
import { getEnvironmentVariableFactory } from "./environment-variables/factory";
import { isDirectory } from "./fs-helpers";

/**
 * `CLOUDFLARE_CONFIG_DIR` pins the global config directory for the whole
 * process tree.
 *
 * A top-level CLI (e.g. `wrangler dev` or a future `cf dev`) can set this so
 * that tools it delegates to — the Vite plugin and `@cloudflare/remote-bindings`
 * — discover the *same* OAuth token location and can refresh tokens mid-run,
 * even when the delegated tool would otherwise resolve a different default
 * (e.g. a different `appName`).
 *
 * When set, it takes precedence over the legacy `~/.<appName>` directory and the
 * XDG-compliant path.
 */
export const getGlobalConfigDirFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_CONFIG_DIR",
});

export interface GetGlobalConfigPathOptions {
	/**
	 * The application namespace. Defaults to `"wrangler"`.
	 */
	appName?: string;
	/**
	 * Whether to prepend a `.` to `appName` when resolving the XDG path and the
	 * legacy `$HOME` directory. Defaults to `true` to match wrangler's
	 * historical behaviour (`.wrangler`).
	 */
	leadingDot?: boolean;
	/**
	 * When `true` (the default, matching wrangler's historical behaviour), a
	 * pre-existing `~/.<appName>` directory takes precedence over the XDG path.
	 * Pass `false` to always use the XDG-compliant path.
	 */
	useLegacyHomeDir?: boolean;
}

/**
 * Resolve the global config directory for a Cloudflare CLI.
 *
 * Defaults to wrangler's directory (`.wrangler`) so existing callers are
 * unaffected, but accepts an `appName` so other first-party CLIs (e.g. `cf`)
 * can reuse the same XDG-compliant resolution under their own namespace.
 */
export function getGlobalConfigPath({
	appName = "wrangler",
	leadingDot = true,
	useLegacyHomeDir = true,
}: GetGlobalConfigPathOptions = {}) {
	// An explicit `CLOUDFLARE_CONFIG_DIR` pins the location for the whole process
	// tree, so a delegated tool resolves the same config (and OAuth token) as the
	// top-level CLI that invoked it.
	const configDirFromEnv = getGlobalConfigDirFromEnv();
	if (configDirFromEnv) {
		return configDirFromEnv;
	}

	const dirName = `${leadingDot ? "." : ""}${appName}`;
	const configDir = xdgAppPaths(dirName).config(); // New XDG compliant config path

	if (useLegacyHomeDir) {
		const legacyConfigDir = path.join(os.homedir(), dirName); // Legacy config in user's home directory
		// Check for the legacy directory in $HOME; if it is not there then use the
		// XDG compliant path.
		if (isDirectory(legacyConfigDir)) {
			return legacyConfigDir;
		}
	}

	return configDir;
}

/**
 * @deprecated Use {@link getGlobalConfigPath} instead.
 */
export function getGlobalWranglerConfigPath() {
	return getGlobalConfigPath();
}
