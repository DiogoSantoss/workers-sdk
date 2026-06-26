---
"@cloudflare/workers-utils": minor
---

Add a `CLOUDFLARE_CONFIG_DIR` environment variable that pins the global config directory used by `getGlobalConfigPath`.

A top-level Cloudflare CLI can set this so that tools it delegates to (e.g. the Vite plugin and `@cloudflare/remote-bindings`) resolve the same config — and therefore the same stored OAuth token — across the whole process tree. When unset, resolution is unchanged.

Also recognises additional delegated-auth environment variables: `CLOUDFLARE_AUTH_CONFIG_FILE`, `CLOUDFLARE_OAUTH_CLIENT_ID`, `CLOUDFLARE_ALLOW_GLOBAL_API_KEY`, and `CLOUDFLARE_LOGIN_COMMAND`.
