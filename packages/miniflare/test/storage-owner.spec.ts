import { utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
	clearStorageOwner,
	countLiveStorageClients,
	heartbeatStorageOwner,
	isProcessAlive,
	Miniflare,
	OWNER_STALE_MS,
	readStorageOwner,
	registerStorageClient,
	tryAcquireOwnerSpawnLock,
	unregisterStorageClient,
	writeStorageOwner,
	type StorageOwnerDefinition,
} from "miniflare";
import { describe, it, vi } from "vitest";
import { useTmp } from "./test-shared";

// A pid that is essentially guaranteed not to exist on the host.
const DEAD_PID = 0x7fffffff;

function makeDefinition(
	overrides: Partial<StorageOwnerDefinition> = {}
): StorageOwnerDefinition {
	return {
		pid: process.pid,
		debugPortAddress: "127.0.0.1:12345",
		updatedAt: Date.now(),
		...overrides,
	};
}

describe("isProcessAlive", () => {
	it("reports the current process as alive", ({ expect }) => {
		expect(isProcessAlive(process.pid)).toBe(true);
	});
	it("reports a non-existent process as dead", ({ expect }) => {
		expect(isProcessAlive(DEAD_PID)).toBe(false);
	});
	it("treats invalid pids as dead", ({ expect }) => {
		expect(isProcessAlive(0)).toBe(false);
		expect(isProcessAlive(-1)).toBe(false);
	});
});

describe("storage owner definition", () => {
	it("returns undefined when no owner is published", async ({ expect }) => {
		const persistRoot = await useTmp();
		expect(readStorageOwner(persistRoot)).toBeUndefined();
	});

	it("round-trips a published definition", async ({ expect }) => {
		const persistRoot = await useTmp();
		const def = makeDefinition();
		writeStorageOwner(persistRoot, def);
		expect(readStorageOwner(persistRoot)).toEqual(def);
	});

	it("treats a definition with a dead pid as absent", async ({ expect }) => {
		const persistRoot = await useTmp();
		writeStorageOwner(persistRoot, makeDefinition({ pid: DEAD_PID }));
		expect(readStorageOwner(persistRoot)).toBeUndefined();
	});

	it("treats a stale (un-heartbeated) definition as absent", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		writeStorageOwner(persistRoot, makeDefinition());
		// Backdate the mtime well past the staleness window.
		const old = new Date(Date.now() - OWNER_STALE_MS - 60_000);
		utimesSync(path.join(persistRoot, ".miniflare-owner.json"), old, old);
		expect(readStorageOwner(persistRoot)).toBeUndefined();
		// A heartbeat refreshes it back to live.
		heartbeatStorageOwner(persistRoot);
		expect(readStorageOwner(persistRoot)).toBeDefined();
	});

	it("ignores a partially-written definition file", async ({ expect }) => {
		const persistRoot = await useTmp();
		writeFileSync(
			path.join(persistRoot, ".miniflare-owner.json"),
			"{ not valid json"
		);
		expect(readStorageOwner(persistRoot)).toBeUndefined();
	});

	it("clearStorageOwner removes our own definition", async ({ expect }) => {
		const persistRoot = await useTmp();
		writeStorageOwner(persistRoot, makeDefinition());
		clearStorageOwner(persistRoot, process.pid);
		expect(readStorageOwner(persistRoot)).toBeUndefined();
	});

	it("clearStorageOwner does not stomp a different live owner", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		// Pretend the current process is a *different* live owner.
		writeStorageOwner(persistRoot, makeDefinition({ pid: process.pid }));
		clearStorageOwner(persistRoot, process.pid + 1);
		expect(readStorageOwner(persistRoot)).toBeDefined();
	});
});

describe("owner spawn lock", () => {
	it("grants the lock to a single acquirer", async ({ expect }) => {
		const persistRoot = await useTmp();
		const first = tryAcquireOwnerSpawnLock(persistRoot);
		expect(first).toBeDefined();
		const second = tryAcquireOwnerSpawnLock(persistRoot);
		expect(second).toBeUndefined();
		first?.release();
		const third = tryAcquireOwnerSpawnLock(persistRoot);
		expect(third).toBeDefined();
		third?.release();
	});

	it("reclaims a lock held by a dead process", async ({ expect }) => {
		const persistRoot = await useTmp();
		// Simulate a crashed holder by writing a dead pid into the lock file.
		writeFileSync(
			path.join(persistRoot, ".miniflare-owner.lock"),
			String(DEAD_PID)
		);
		const lock = tryAcquireOwnerSpawnLock(persistRoot);
		expect(lock).toBeDefined();
		lock?.release();
	});

	it("reclaims a stale lock", async ({ expect }) => {
		const persistRoot = await useTmp();
		const lockPath = path.join(persistRoot, ".miniflare-owner.lock");
		writeFileSync(lockPath, String(process.pid));
		const old = new Date(Date.now() - OWNER_STALE_MS - 60_000);
		utimesSync(lockPath, old, old);
		const lock = tryAcquireOwnerSpawnLock(persistRoot);
		expect(lock).toBeDefined();
		lock?.release();
	});
});

describe("client presence registry", () => {
	it("counts live clients and reclaims dead/stale ones", async ({ expect }) => {
		const persistRoot = await useTmp();
		expect(countLiveStorageClients(persistRoot)).toBe(0);

		const clientPath = registerStorageClient(persistRoot);
		expect(countLiveStorageClients(persistRoot)).toBe(1);

		// A dead client is reclaimed and not counted.
		const deadClient = path.join(
			persistRoot,
			".miniflare-owner-clients",
			String(DEAD_PID)
		);
		writeFileSync(deadClient, String(Date.now()));
		expect(countLiveStorageClients(persistRoot)).toBe(1);

		unregisterStorageClient(clientPath);
		expect(countLiveStorageClients(persistRoot)).toBe(0);
	});
});

describe.sequential("owner presence integration", () => {
	it("an owner-role instance publishes a live definition and clears it on dispose", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		const owner = new Miniflare({
			unsafeSharedStorageOwner: true,
			unsafeStorageOwnerRole: "owner",
			defaultPersistRoot: persistRoot,
			unsafeDevRegistryPath: registryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			kvNamespaces: ["NS"],
			script:
				"export default { async fetch() { return new Response('owner'); } }",
		});
		await owner.ready;

		const def = readStorageOwner(persistRoot);
		expect(def).toBeDefined();
		expect(def?.pid).toBe(process.pid);
		expect(def?.debugPortAddress).toMatch(/^127\.0\.0\.1:\d+$/);

		await owner.dispose();
		expect(readStorageOwner(persistRoot)).toBeUndefined();
	});

	it("a client-role instance registers presence and removes it on dispose", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		const client = new Miniflare({
			unsafeSharedStorageOwner: true,
			unsafeStorageOwnerRole: "client",
			defaultPersistRoot: persistRoot,
			unsafeDevRegistryPath: registryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			script:
				"export default { async fetch() { return new Response('client'); } }",
		});
		await client.ready;

		await vi.waitFor(
			() => expect(countLiveStorageClients(persistRoot)).toBe(1),
			{
				timeout: 5_000,
				interval: 100,
			}
		);

		await client.dispose();
		expect(countLiveStorageClients(persistRoot)).toBe(0);
	});

	it("routes a client's KV through the owner so storage is shared", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		const KV_WORKER = `export default {
			async fetch(request, env) {
				const url = new URL(request.url);
				const key = url.searchParams.get("key") ?? "k";
				if (request.method === "PUT") {
					await env.NS.put(key, await request.text());
					return new Response("ok");
				}
				const val = await env.NS.get(key);
				return new Response(val ?? "<null>");
			}
		}`;
		const common = {
			unsafeSharedStorageOwner: true,
			defaultPersistRoot: persistRoot,
			unsafeDevRegistryPath: registryPath,
			compatibilityFlags: ["experimental"],
			compatibilityDate: "2025-01-01",
			modules: true,
			kvNamespaces: ["NS"],
			script: KV_WORKER,
		};

		const owner = new Miniflare({ ...common, unsafeStorageOwnerRole: "owner" });
		await owner.ready;
		const client = new Miniflare({
			...common,
			unsafeStorageOwnerRole: "client",
		});

		try {
			await client.ready;

			// Write through the client (which routes to the owner).
			const putRes = await client.dispatchFetch("http://x/?key=greeting", {
				method: "PUT",
				body: "hello-from-client",
			});
			expect(await putRes.text()).toBe("ok");

			// The owner can read what the client wrote → storage is shared.
			const ownerRes = await owner.dispatchFetch("http://x/?key=greeting");
			expect(await ownerRes.text()).toBe("hello-from-client");

			// And the client can read it back through the proxy.
			const clientRes = await client.dispatchFetch("http://x/?key=greeting");
			expect(await clientRes.text()).toBe("hello-from-client");
		} finally {
			await client.dispose();
			await owner.dispose();
		}
	});

	it("auto-spawns a detached owner, routes to it, and tears it down when idle", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		// Shrink the owner's teardown timings (inherited by the spawned process).
		const prevGrace = process.env.MINIFLARE_STORAGE_OWNER_GRACE_MS;
		const prevCheck = process.env.MINIFLARE_STORAGE_OWNER_IDLE_CHECK_MS;
		process.env.MINIFLARE_STORAGE_OWNER_GRACE_MS = "500";
		process.env.MINIFLARE_STORAGE_OWNER_IDLE_CHECK_MS = "200";

		let ownerPid: number | undefined;
		const client = new Miniflare({
			// No role set → behaves as a client and auto-spawns an owner.
			unsafeSharedStorageOwner: true,
			defaultPersistRoot: persistRoot,
			unsafeDevRegistryPath: registryPath,
			compatibilityFlags: ["experimental"],
			compatibilityDate: "2025-01-01",
			modules: true,
			kvNamespaces: ["NS"],
			script: `export default {
				async fetch(request, env) {
					if (request.method === "PUT") {
						await env.NS.put("k", await request.text());
						return new Response("ok");
					}
					return new Response((await env.NS.get("k")) ?? "<null>");
				}
			}`,
		});

		try {
			await client.ready;

			// An owner was auto-spawned and published itself.
			const def = readStorageOwner(persistRoot);
			expect(def).toBeDefined();
			ownerPid = def?.pid;
			expect(ownerPid).toBeDefined();
			expect(ownerPid).not.toBe(process.pid); // a separate process

			// Storage works through the routed proxy.
			await (
				await client.dispatchFetch("http://x/", {
					method: "PUT",
					body: "via-auto-owner",
				})
			).text();
			const got = await client.dispatchFetch("http://x/");
			expect(await got.text()).toBe("via-auto-owner");

			// Disposing the only client should let the owner self-terminate.
			await client.dispose();
			await vi.waitFor(
				() => expect(readStorageOwner(persistRoot)).toBeUndefined(),
				{ timeout: 15_000, interval: 200 }
			);
		} finally {
			await client.dispose().catch(() => {});
			// Safety net: ensure the detached owner isn't leaked if assertions failed.
			if (ownerPid !== undefined && isProcessAlive(ownerPid)) {
				try {
					process.kill(ownerPid);
				} catch {}
			}
			process.env.MINIFLARE_STORAGE_OWNER_GRACE_MS = prevGrace;
			process.env.MINIFLARE_STORAGE_OWNER_IDLE_CHECK_MS = prevCheck;
		}
	});

	it("does nothing when the feature flag is off", async ({ expect }) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		const mf = new Miniflare({
			defaultPersistRoot: persistRoot,
			unsafeDevRegistryPath: registryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			script:
				"export default { async fetch() { return new Response('plain'); } }",
		});
		await mf.ready;
		expect(readStorageOwner(persistRoot)).toBeUndefined();
		expect(countLiveStorageClients(persistRoot)).toBe(0);
		await mf.dispose();
	});
});
