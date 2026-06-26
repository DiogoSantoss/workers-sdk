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
