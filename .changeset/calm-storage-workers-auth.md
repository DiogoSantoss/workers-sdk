---
"@cloudflare/workers-auth": minor
---

Configure auth storage by location (path + format) instead of an injected storage object.

`createOAuthFlow`, `readStoredAuthState`, and the new `createEnvApiTokenResolver` now take a `ConfigFileLocation` (`{ getPath, format }`) rather than a full `AuthConfigStorage` implementation — workers-auth owns the on-disk I/O (parsing, serialization, owner-only permissions). Because the location is just plain values, a CLI can configure it entirely from environment variables (e.g. `CLOUDFLARE_AUTH_CONFIG_FILE`, whose extension selects TOML/JSON/JSONC) with no code injection. `createFileStorage(location)` is exported for consumers that need direct read/write (e.g. wrangler's `writeAuthConfigFile`).

New exports: `createFileStorage`, `locationFromPath`, `storageFormatFromPath`, `defaultAuthConfigLocation`, `getAuthConfigFilePath`, and `createEnvApiTokenResolver` (an environment-driven API-token resolver returning env credentials or the stored OAuth token, refreshed when expired; refresh-only, never interactive). `getClientIdFromEnv` now prefers the CLI-neutral `CLOUDFLARE_OAUTH_CLIENT_ID` over `WRANGLER_CLIENT_ID`. Also exposes the `OAuthFlowContext` / `OAuthFlowLogger` types.
