// The per-method params decoders for the websocket ingress boundary, assembled from the same six
// domains `../protocol.ts` composes `RpcCall` from. Before this existed, `isClientMessage` asserted
// a fully-typed discriminated union after checking only that the method name was known and `params`
// was an object, and the dispatcher then read each field at its declared type — the opposite posture
// from `decodeKnownFrame` in `../remote/frame-decode.ts`, which validates every field of every arm.
import type { ClientMessage } from '../protocol.js';
import { isRecord, type ParamsDecoder } from './guards.js';
import { CORE_PARAMS } from './core.js';
import { FILE_NAVIGATOR_PARAMS } from './file-navigator.js';
import { EDITOR_PARAMS } from './editor.js';
import { MONITOR_PARAMS } from './monitor.js';
import { SCHEDULE_PARAMS } from './schedule.js';
import { PLUGIN_PARAMS } from './plugin.js';

// Each domain table is already keyed by its own slice of the union, so this `satisfies` is the
// second half of the check: a whole domain dropped from the spread stops compiling here.
export const CLIENT_PARAMS_DECODERS = {
  ...CORE_PARAMS,
  ...FILE_NAVIGATOR_PARAMS,
  ...EDITOR_PARAMS,
  ...MONITOR_PARAMS,
  ...SCHEDULE_PARAMS,
  ...PLUGIN_PARAMS,
} satisfies Record<ClientMessage['method'], ParamsDecoder>;

// Takes `unknown` rather than `Record<string, unknown>` so the caller does not have to cast
// `ClientMessage['params']` — the union of all sixty-six params types — down to a record.
export function clientParamsValid(method: ClientMessage['method'], params: unknown): boolean {
  return isRecord(params) && CLIENT_PARAMS_DECODERS[method](params);
}
