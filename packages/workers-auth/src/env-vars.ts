import {
	getCloudflareApiEnvironmentFromEnv,
	getEnvironmentVariableFactory,
} from "@cloudflare/workers-utils";

/**
 * `WRANGLER_CLIENT_ID` is the UUID of the registered OAuth app used to identify
 * the CLI to the Cloudflare OAuth server. Defaults to wrangler's app (the same
 * app that mints the stored OAuth token), so that a delegated tool such as
 * `@cloudflare/remote-bindings` can refresh that token with a matching client
 * ID. A CLI that registers its own OAuth app should set `WRANGLER_CLIENT_ID`.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `WRANGLER_API_ENVIRONMENT=staging` environment variable instead.
 */
/**
 * `CLOUDFLARE_OAUTH_CLIENT_ID` is the CLI-neutral name for the OAuth client ID.
 * Preferred over the wrangler-branded `WRANGLER_CLIENT_ID` so a non-wrangler CLI
 * (e.g. `cf`) can configure the OAuth app it minted a token with — for example
 * when a delegated tool such as `@cloudflare/remote-bindings` needs to refresh
 * that token — without setting a `WRANGLER_`-prefixed variable.
 */
const getOAuthClientIdFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_OAUTH_CLIENT_ID",
});

/**
 * `WRANGLER_CLIENT_ID` is the UUID of wrangler's registered OAuth app. Retained
 * for backwards compatibility and as the source of the prod/staging defaults.
 */
const getWranglerClientIdFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_CLIENT_ID",
	defaultValue: () =>
		getCloudflareApiEnvironmentFromEnv() === "staging"
			? "4b2ea6cc-9421-4761-874b-ce550e0e3def"
			: "54d11594-84e4-41aa-b438-e81b8fa78ee7",
});

/**
 * Resolve the OAuth client ID, preferring the CLI-neutral
 * `CLOUDFLARE_OAUTH_CLIENT_ID`, then `WRANGLER_CLIENT_ID`, then wrangler's
 * prod/staging default.
 */
export const getClientIdFromEnv = (): string =>
	getOAuthClientIdFromEnv() ?? getWranglerClientIdFromEnv();

/**
 * `WRANGLER_AUTH_DOMAIN` is the URL base domain that is used
 * to access OAuth URLs for the Cloudflare APIs.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `WRANGLER_API_ENVIRONMENT=staging` environment variable instead.
 */
export const getAuthDomainFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_AUTH_DOMAIN",
	defaultValue: () =>
		getCloudflareApiEnvironmentFromEnv() === "staging"
			? "dash.staging.cloudflare.com"
			: "dash.cloudflare.com",
});

/**
 * `WRANGLER_AUTH_URL` is the path that is used to access OAuth
 * for the Cloudflare APIs.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `WRANGLER_API_ENVIRONMENT=staging` environment variable instead.
 */
export const getAuthUrlFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_AUTH_URL",
	defaultValue: () => `https://${getAuthDomainFromEnv()}/oauth2/auth`,
});

/**
 * `WRANGLER_TOKEN_URL` is the path that is used to exchange an OAuth
 * token for an API token.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `WRANGLER_API_ENVIRONMENT=staging` environment variable instead.
 */
export const getTokenUrlFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_TOKEN_URL",
	defaultValue: () => `https://${getAuthDomainFromEnv()}/oauth2/token`,
});

/**
 * `WRANGLER_REVOKE_URL` is the path that is used to exchange an OAuth
 * refresh token for a new OAuth token.
 *
 * Normally you should not need to set this explicitly.
 * If you want to switch to the staging environment set the
 * `WRANGLER_API_ENVIRONMENT=staging` environment variable instead.
 */
export const getRevokeUrlFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_REVOKE_URL",
	defaultValue: () => `https://${getAuthDomainFromEnv()}/oauth2/revoke`,
});

/**
 * `CLOUDFLARE_ACCESS_CLIENT_ID` is the Client ID of a Cloudflare Access Service Token.
 * Used together with `CLOUDFLARE_ACCESS_CLIENT_SECRET` to authenticate with
 * Access-protected domains in non-interactive environments (e.g. CI).
 *
 * @see https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
 */
export const getAccessClientIdFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ACCESS_CLIENT_ID",
});

/**
 * `CLOUDFLARE_ACCESS_CLIENT_SECRET` is the Client Secret of a Cloudflare Access Service Token.
 * Used together with `CLOUDFLARE_ACCESS_CLIENT_ID` to authenticate with
 * Access-protected domains in non-interactive environments (e.g. CI).
 *
 * @see https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
 */
export const getAccessClientSecretFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ACCESS_CLIENT_SECRET",
});

/**
 * `WRANGLER_CF_AUTHORIZATION_TOKEN` is an explicit `CF_Authorization` cookie value
 * used to authenticate against the OAuth auth domain when it is Access-protected
 * (typically staging). When set, the OAuth flow skips Access detection and uses
 * this token directly.
 */
export const getCfAuthorizationTokenFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_CF_AUTHORIZATION_TOKEN",
});
