import {
	chmodSync,
	existsSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { parseJSONC, parseTOML, readFileSync } from "@cloudflare/workers-utils";
import TOML from "smol-toml";
import type { ConfigStorage } from ".";

/**
 * On-disk serialization format for a config file.
 *
 * Wrangler stores its auth config as TOML; other first-party CLIs (e.g. `cf`)
 * store it as JSON / JSONC, in a different location. All share the same logical
 * shape, so a single storage implementation — parameterised by format and path
 * — serves every consumer.
 */
export type StorageFileFormat = "toml" | "json" | "jsonc";

/**
 * Where (and in what format) a config file lives on disk.
 *
 * This is the *only* storage knob consumers configure — workers-auth owns the
 * actual file I/O (parsing, serialization, owner-only permissions). Because both
 * fields are simple values, a CLI can configure them entirely from environment
 * variables (e.g. `CLOUDFLARE_AUTH_CONFIG_FILE`), with no code injection.
 */
export interface ConfigFileLocation {
	/** Resolve the absolute path to the file. Called on every access. */
	getPath: () => string;
	/** On-disk serialization format. Defaults to `"toml"`. */
	format?: StorageFileFormat;
}

/**
 * Infer the {@link StorageFileFormat} from a file path's extension.
 * Defaults to `"toml"` (wrangler's format) for unknown extensions.
 */
export function storageFormatFromPath(filePath: string): StorageFileFormat {
	const ext = path.extname(filePath).toLowerCase();
	if (ext === ".jsonc") {
		return "jsonc";
	}
	if (ext === ".json") {
		return "json";
	}
	return "toml";
}

/**
 * Build a {@link ConfigFileLocation} for a fixed path, inferring the format from
 * the file extension. Useful for env-var-driven configuration (e.g. pointing at
 * another CLI's `auth.jsonc`).
 */
export function locationFromPath(filePath: string): ConfigFileLocation {
	return { getPath: () => filePath, format: storageFormatFromPath(filePath) };
}

/**
 * Build a file-on-disk {@link ConfigStorage} from a {@link ConfigFileLocation}.
 *
 * Internal to workers-auth: consumers configure a {@link ConfigFileLocation},
 * not a storage object. `read()` throws when the file is missing or cannot be
 * parsed — callers treat a throw as "nothing stored". Files are written with
 * mode `0o600` on creation and re-`chmod`'d on every save (the `mode` option
 * only applies on creation) so other local users on shared hosts can't read the
 * stored credentials.
 */
export function createFileStorage<T extends object>(
	location: ConfigFileLocation
): ConfigStorage<T> {
	const { getPath, format = "toml" } = location;

	const parse = (raw: string): T => {
		switch (format) {
			case "json":
				return JSON.parse(raw) as T;
			case "jsonc":
				// Tolerant of comments/trailing commas — e.g. cf's `auth.jsonc`.
				return parseJSONC(raw) as T;
			default:
				return parseTOML(raw) as T;
		}
	};
	const stringify = (config: T): string =>
		format === "json" || format === "jsonc"
			? JSON.stringify(config, null, 2)
			: TOML.stringify(config as Record<string, unknown>);

	return {
		read: () => parse(readFileSync(getPath())),
		write(config) {
			const configPath = getPath();
			mkdirSync(path.dirname(configPath), { recursive: true });
			writeFileSync(configPath, stringify(config), {
				encoding: "utf-8",
				mode: 0o600,
			});
			chmodSync(configPath, 0o600);
		},
		clear() {
			const configPath = getPath();
			const existed = existsSync(configPath);
			rmSync(configPath, { force: true });
			return existed;
		},
		path: getPath,
	};
}
