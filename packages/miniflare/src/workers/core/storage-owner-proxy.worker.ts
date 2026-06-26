import { WorkerEntrypoint } from "cloudflare:workers";
import { SharedBindings } from "miniflare:shared";
import type { WorkerdDebugPortConnector } from "./dev-registry-proxy-shared.worker";

// Client-side proxy for the "central storage owner" feature. A client's storage
// binding (KV/R2/D1) is repointed at this entrypoint; it forwards each request
// to the owner process's shared object-entry service over the workerd debug
// port, passing the resource id through as `ctx.props` so the owner's
// object-entry worker resolves the correct Durable Object locally (and so the
// owner — not the client — performs all SQLite/blob I/O).

interface Env {
	// Outbound connector to other workerd debug ports.
	STORAGE_OWNER_DEBUG_PORT: WorkerdDebugPortConnector;
	// The owner process's debug-port address (e.g. "127.0.0.1:12345"), baked in
	// at config-assembly time from the published owner definition.
	STORAGE_OWNER_ADDRESS: string;
}

interface Props {
	// The owner's shared object-entry service name (e.g. "kv:ns:entry").
	ownerService: string;
	// The resource id (KV namespace / R2 bucket / D1 database id). Forwarded to
	// the owner's object-entry worker as `ctx.props[TEXT_NAMESPACE]`.
	namespace: string;
}

function resolve(props: Props, env: Env): Fetcher {
	const client = env.STORAGE_OWNER_DEBUG_PORT.connect(
		env.STORAGE_OWNER_ADDRESS
	);
	return client.getEntrypoint(props.ownerService, undefined, {
		[SharedBindings.TEXT_NAMESPACE]: props.namespace,
	});
}

export class StorageOwnerProxy extends WorkerEntrypoint<Env, Props> {
	fetch(request: Request): Promise<Response> {
		return resolve(this.ctx.props, this.env).fetch(request);
	}
}
