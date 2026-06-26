import type { OAuthFlowLogger } from "./context";

const noop = (): void => {};

/**
 * Normalise a partial logger (callers often pass only `debug`, or a CLI's full
 * `logger` singleton) into a complete {@link OAuthFlowLogger}, defaulting any
 * missing methods to no-ops.
 */
export function normalizeLogger(
	logger?: Partial<OAuthFlowLogger>
): OAuthFlowLogger {
	return {
		debug: logger?.debug?.bind(logger) ?? noop,
		info: logger?.info?.bind(logger) ?? noop,
		log: logger?.log?.bind(logger) ?? noop,
		warn: logger?.warn?.bind(logger) ?? noop,
		error: logger?.error?.bind(logger) ?? noop,
	};
}
