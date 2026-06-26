import {
	getBooleanEnvironmentVariableFactory,
	getEnvironmentVariableFactory,
} from "@cloudflare/workers-utils";
import { defaultAuthConfigLocation } from "./config-file/default-auth-storage";
import { locationFromPath } from "./config-file/file-storage";
import { getAuthFromEnv } from "./credentials";
import { getClientIdFromEnv } from "./env-vars";
import { createOAuthFlow } from "./flow";
import { normalizeLogger } from "./logger";
import type { ConfigFileLocation } from "./config-file/file-storage";
import type { OAuthFlowLogger } from "./context";
import type { ApiCredentials } from "@cloudflare/workers-utils";

/**
 * `CLOUDFLARE_AUTH_CONFIG_FILE` — explicit path to the auth-config file to
 * read/refresh. Set by a top-level CLI whose auth file differs from wrangler's
 * default (e.g. `cf`'s `auth.jsonc`). The on-disk format is inferred from the
 * extension.
 */
const getAuthConfigFileFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_AUTH_CONFIG_FILE",
});

/**
 * `CLOUDFLARE_ALLOW_GLOBAL_API_KEY` — whether to honour the global API key +
 * email pair in addition to scoped API tokens. Defaults to `true` (wrangler's
 * behaviour); a CLI that only supports scoped tokens (e.g. `cf`) sets `false`.
 */
const getAllowGlobalAuthKeyFromEnv = getBooleanEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ALLOW_GLOBAL_API_KEY",
	defaultValue: true,
});

/**
 * `CLOUDFLARE_LOGIN_COMMAND` — the command a user should run to authenticate
 * (e.g. `cf login`). Used to make the "not authenticated" error actionable for
 * whichever top-level CLI is driving the resolver.
 */
const getLoginCommandFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_LOGIN_COMMAND",
});

/**
 * Resolve the auth-config file location from the environment:
 *  - an explicit `CLOUDFLARE_AUTH_CONFIG_FILE` (any CLI's file/format), else
 *  - wrangler's default TOML file under the global config directory (which
 *    honours `CLOUDFLARE_CONFIG_DIR`).
 */
function authConfigFromEnv(): ConfigFileLocation {
	const file = getAuthConfigFileFromEnv();
	if (file) {
		return locationFromPath(file);
	}
	return defaultAuthConfigLocation();
}

function notAuthenticatedError(loginHint: string | undefined): Error {
	const hint =
		loginHint ??
		(getLoginCommandFromEnv()
			? `Run \`${getLoginCommandFromEnv()}\``
			: "Log in with your Cloudflare CLI (e.g. `wrangler login` or `cf login`)");
	return new Error(`Not authenticated. ${hint}, or set CLOUDFLARE_API_TOKEN.`);
}

export interface EnvApiTokenResolverOptions {
	/**
	 * Override the auth-config file location (path + format).
	 *
	 * When omitted, the location is resolved from the environment: an explicit
	 * `CLOUDFLARE_AUTH_CONFIG_FILE` (any CLI's file + format, e.g. `cf`'s
	 * `auth.jsonc`), otherwise wrangler's default TOML file under the global
	 * config directory (honouring `CLOUDFLARE_CONFIG_DIR`).
	 */
	authConfig?: ConfigFileLocation;
	/**
	 * The OAuth client ID used when refreshing a stored token. Must match the
	 * app that minted it. Defaults to {@link getClientIdFromEnv}
	 * (`CLOUDFLARE_OAUTH_CLIENT_ID` / `WRANGLER_CLIENT_ID`).
	 */
	clientId?: string | (() => string);
	/**
	 * Whether to honour the global API key + email pair (`CLOUDFLARE_API_KEY` +
	 * `CLOUDFLARE_EMAIL`). Defaults to `CLOUDFLARE_ALLOW_GLOBAL_API_KEY`, or
	 * `true` when unset.
	 */
	allowGlobalAuthKey?: boolean;
	/**
	 * Message appended to the "not authenticated" error. Defaults to
	 * `CLOUDFLARE_LOGIN_COMMAND` (rendered as "Run `<command>`"), or a
	 * CLI-agnostic hint when unset.
	 */
	loginHint?: string;
	/** Logger for debug output. */
	logger?: Partial<OAuthFlowLogger>;
}

/**
 * Build an API-token resolver driven entirely by the environment.
 *
 * Resolution order (highest priority first):
 *   1. Environment credentials (`CLOUDFLARE_API_TOKEN`, or — when allowed —
 *      `CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL`).
 *   2. The stored OAuth access token, refreshed via the refresh-token grant
 *      when expired.
 *
 * This is refresh-only — it never launches an interactive login (the top-level
 * CLI owns that). When neither source yields credentials it throws an
 * actionable, CLI-agnostic error.
 *
 * The returned function should be called fresh on every request so a token
 * rotated on disk is always honoured.
 */
export function createEnvApiTokenResolver(
	options: EnvApiTokenResolverOptions = {}
): () => Promise<ApiCredentials> {
	const logger = normalizeLogger(options.logger);
	const authConfig = options.authConfig ?? authConfigFromEnv();
	const allowGlobalAuthKey =
		options.allowGlobalAuthKey ?? getAllowGlobalAuthKeyFromEnv();

	const flow = createOAuthFlow({
		logger,
		isNonInteractiveOrCI: () => true,
		openInBrowser: async () => {},
		hasEnvCredentials: () =>
			getAuthFromEnv({ allowGlobalAuthKey }) !== undefined,
		clientId: options.clientId ?? getClientIdFromEnv,
		// Consent pages / redirect URI are only used by interactive login, which
		// this resolver never triggers — supply inert placeholders.
		consent: { granted: { url: "" }, denied: { url: "", error: "" } },
		redirectUri: "http://localhost/",
		authConfig,
		allowGlobalAuthKey,
		temporary: undefined,
	});

	return async (): Promise<ApiCredentials> => {
		const envAuth = getAuthFromEnv({ allowGlobalAuthKey });
		if (envAuth) {
			return envAuth;
		}

		const oauthToken = await flow.getOAuthTokenFromLocalState();
		if (oauthToken) {
			return { apiToken: oauthToken };
		}

		throw notAuthenticatedError(options.loginHint);
	};
}
