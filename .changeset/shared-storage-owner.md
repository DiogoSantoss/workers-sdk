---
"miniflare": minor
---

Add experimental `unsafeSharedStorageOwner` option to share local storage across processes

When several Miniflare instances run against the same persist root (for example multiple `wrangler dev` / `vite dev` sessions), each one opens the same SQLite and blob files, which can produce cross-process `SQLITE_BUSY` errors under concurrent access. With `unsafeSharedStorageOwner` enabled, a single detached "owner" process opens the storage files and every other instance routes its KV, R2 and D1 operations to that owner over the workerd debug port, so exactly one process performs storage I/O. The owner is elected and spawned automatically, and self-terminates once no instances remain.

The option is off by default and requires `unsafeDevRegistryPath` to be set. Cache is not yet routed through the owner.
