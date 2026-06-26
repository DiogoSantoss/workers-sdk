import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { getClientIdFromEnv } from "../src/env-vars";

describe("getClientIdFromEnv", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
		// Ensure a deterministic (production) default with the client-id vars unset.
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "production");
		vi.stubEnv("CLOUDFLARE_OAUTH_CLIENT_ID", undefined);
		vi.stubEnv("WRANGLER_CLIENT_ID", undefined);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("defaults to wrangler's production OAuth app", ({ expect }) => {
		expect(getClientIdFromEnv()).toBe("54d11594-84e4-41aa-b438-e81b8fa78ee7");
	});

	it("honours WRANGLER_CLIENT_ID", ({ expect }) => {
		vi.stubEnv("WRANGLER_CLIENT_ID", "wrangler-app-id");
		expect(getClientIdFromEnv()).toBe("wrangler-app-id");
	});

	it("prefers the CLI-neutral CLOUDFLARE_OAUTH_CLIENT_ID over WRANGLER_CLIENT_ID", ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_CLIENT_ID", "wrangler-app-id");
		vi.stubEnv("CLOUDFLARE_OAUTH_CLIENT_ID", "cf-app-id");
		expect(getClientIdFromEnv()).toBe("cf-app-id");
	});
});
