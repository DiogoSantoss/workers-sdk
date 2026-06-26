// The package's logger surface re-uses `@cloudflare/workers-auth`'s logger
// (the same one the OAuth flow and Access detection expect), so there's a
// single `normalizeLogger` implementation across packages.
export { normalizeLogger } from "@cloudflare/workers-auth";
export type { OAuthFlowLogger as Logger } from "@cloudflare/workers-auth";
