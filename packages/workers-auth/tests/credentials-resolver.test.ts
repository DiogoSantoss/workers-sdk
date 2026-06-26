import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { createFileStorage } from "../src/config-file/file-storage";
import { createEnvApiTokenResolver } from "../src/credentials-resolver";
import type { UserAuthConfig } from "../src/config-file/auth";
import type { ConfigFileLocation } from "../src/config-file/file-storage";

/**
 * A config-file location pointing at a throwaway temp file, so tests never read
 * the developer's real `~/.wrangler` auth config.
 */
function tempAuthConfig(seed?: UserAuthConfig): ConfigFileLocation {
	const dir = mkdtempSync(path.join(tmpdir(), "wa-resolver-"));
	const file = path.join(dir, "default.toml");
	const location: ConfigFileLocation = { getPath: () => file, format: "toml" };
	if (seed) {
		createFileStorage<UserAuthConfig>(location).write(seed);
	}
	return location;
}

describe("createEnvApiTokenResolver", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("prefers CLOUDFLARE_API_TOKEN env credentials", async ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "env-token");
		const resolve = createEnvApiTokenResolver({ authConfig: tempAuthConfig() });
		expect(await resolve()).toEqual({ apiToken: "env-token" });
	});

	it("falls back to a non-expired stored OAuth token", async ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
		vi.stubEnv("CLOUDFLARE_API_KEY", "");
		const authConfig = tempAuthConfig({
			oauth_token: "stored-oauth-token",
			refresh_token: "refresh",
			expiration_time: new Date(Date.now() + 60_000).toISOString(),
		});
		const resolve = createEnvApiTokenResolver({ authConfig });
		expect(await resolve()).toEqual({ apiToken: "stored-oauth-token" });
	});

	it("discovers a cf-style JSONC auth file via CLOUDFLARE_AUTH_CONFIG_FILE", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
		vi.stubEnv("CLOUDFLARE_API_KEY", "");
		const dir = mkdtempSync(path.join(tmpdir(), "wa-cf-"));
		const file = path.join(dir, "auth.jsonc");
		writeFileSync(
			file,
			`{\n\t// cf stores its OAuth token as JSONC\n\t"oauth_token": "cf-oauth-token",\n\t"refresh_token": "cf-refresh",\n\t"expiration_time": "${new Date(
				Date.now() + 60_000
			).toISOString()}"\n}\n`
		);
		vi.stubEnv("CLOUDFLARE_AUTH_CONFIG_FILE", file);

		const resolve = createEnvApiTokenResolver();
		expect(await resolve()).toEqual({ apiToken: "cf-oauth-token" });
	});

	it("throws when no credentials are available", async ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
		vi.stubEnv("CLOUDFLARE_API_KEY", "");
		const resolve = createEnvApiTokenResolver({ authConfig: tempAuthConfig() });
		await expect(resolve()).rejects.toThrow("Not authenticated");
	});

	it("uses CLOUDFLARE_LOGIN_COMMAND in the not-authenticated error", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
		vi.stubEnv("CLOUDFLARE_API_KEY", "");
		vi.stubEnv("CLOUDFLARE_LOGIN_COMMAND", "cf login");
		const resolve = createEnvApiTokenResolver({ authConfig: tempAuthConfig() });
		await expect(resolve()).rejects.toThrow("Run `cf login`");
	});

	it("honours a programmatic loginHint", async ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
		vi.stubEnv("CLOUDFLARE_API_KEY", "");
		const resolve = createEnvApiTokenResolver({
			authConfig: tempAuthConfig(),
			loginHint: "Authenticate via the dashboard",
		});
		await expect(resolve()).rejects.toThrow("Authenticate via the dashboard");
	});

	it("ignores the global API key + email when allowGlobalAuthKey is false", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
		vi.stubEnv("CLOUDFLARE_API_KEY", "global-key");
		vi.stubEnv("CLOUDFLARE_EMAIL", "user@example.com");
		const resolve = createEnvApiTokenResolver({
			authConfig: tempAuthConfig(),
			allowGlobalAuthKey: false,
		});
		await expect(resolve()).rejects.toThrow("Not authenticated");
	});

	it("honours the global API key + email by default", async ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
		vi.stubEnv("CLOUDFLARE_API_KEY", "global-key");
		vi.stubEnv("CLOUDFLARE_EMAIL", "user@example.com");
		const resolve = createEnvApiTokenResolver({ authConfig: tempAuthConfig() });
		expect(await resolve()).toEqual({
			authKey: "global-key",
			authEmail: "user@example.com",
		});
	});
});
