import type { PluginRpcCall } from '../protocol/plugin.js';
import { isRecord, isString, type ParamsDecoder } from './guards.js';

// These two were the only params guards this codebase had before the table around them existed, and
// `src/message-handler.ts` re-checks both inside its own dispatch arms. They stay exported
// predicates for that reason; `client-message.ts` re-exports them from here so that import keeps
// resolving to one definition.

// `payload` is `unknown` by design — a plugin's intent body is the plugin's own contract — so the
// check is that the key is present rather than what it holds.
export function isPluginIntentParams(value: unknown): value is {
  tab: string;
  intent: string;
  payload: unknown;
} {
  return isRecord(value)
    && isString(value.tab)
    && isString(value.intent)
    && Object.hasOwn(value, 'payload');
}

export function isPluginFailedParams(value: unknown): value is { tab: string; reason: string } {
  return isRecord(value)
    && isString(value.tab)
    && isString(value.reason);
}

// Keyed by the union so a method added to `PluginRpcCall` without a decoder fails the build.
export const PLUGIN_PARAMS: Record<PluginRpcCall['method'], ParamsDecoder> = {
  pluginIntent: isPluginIntentParams,
  pluginFailed: isPluginFailedParams,
};
