import { createEnvApiTokenResolver } from "@cloudflare/workers-auth";
import { getEnvironmentVariableFactory } from "@cloudflare/workers-utils";
import type { AuthCredentials } from "./types";
import type { EnvApiTokenResolverOptions } from "@cloudflare/workers-auth";

/**
 * `CLOUDFLARE_ACCOUNT_ID` (legacy alias `CF_ACCOUNT_ID`) — the account whose
 * edge-preview endpoints the remote proxy talks to.
 */
const getAccountIdFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ACCOUNT_ID",
	deprecatedName: "CF_ACCOUNT_ID",
});

export interface EnvAuthResolverOptions extends EnvApiTokenResolverOptions {
	/** Account ID hint. Falls back to `CLOUDFLARE_ACCOUNT_ID` when unset. */
	accountId?: string;
}

/**
 * Build an auth resolver driven entirely by the environment.
 *
 * This is what makes `@cloudflare/remote-bindings` usable deep in a
 * `cf dev → vite dev → remote-bindings` chain without wrangler. Token
 * resolution (env credentials, or the stored OAuth token refreshed on expiry)
 * is delegated to `@cloudflare/workers-auth`'s `createEnvApiTokenResolver`; this
 * adds the account ID to produce the {@link AuthCredentials} the edge-preview
 * API needs.
 *
 * The returned function is invoked fresh on every API request, so a token
 * rotated on disk is always honoured.
 */
export function createEnvAuthResolver(
	options: EnvAuthResolverOptions = {}
): () => Promise<AuthCredentials> {
	const resolveApiToken = createEnvApiTokenResolver(options);

	return async (): Promise<AuthCredentials> => {
		const apiToken = await resolveApiToken();

		const accountId = options.accountId ?? getAccountIdFromEnv();
		if (!accountId) {
			throw new Error(
				"Unable to determine the Cloudflare account ID for remote bindings. " +
					"Set CLOUDFLARE_ACCOUNT_ID or provide an `accountId`/`auth`."
			);
		}

		return { accountId, apiToken };
	};
}
