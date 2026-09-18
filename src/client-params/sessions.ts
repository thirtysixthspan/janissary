import type { RemoteSessionRpcCall } from '../protocol/sessions.js';
import { isOneOf, isString, type ParamsDecoder } from './guards.js';

// One method rather than one per verb: the metadata row's control already decided which way it is
// pointing, so the verb is a field on the request rather than a second decoder and a second
// dispatcher arm saying the same thing.
export const SESSION_PARAMS: Record<RemoteSessionRpcCall['method'], ParamsDecoder> = {
  remoteSession: (params) => isOneOf(params.action, ['detach', 'reattach']) && isString(params.label),
};
