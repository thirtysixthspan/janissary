import type { ClientReplyMode } from '../client-message.js';
import type { ServerEvent } from '../protocol.js';
import { errorText } from '../error-text.js';

export type Reply = (event: ServerEvent) => void;

type DeferredCallback = (resolve: (value: unknown) => void) => void;

function isDeferredCallback(value: unknown): value is DeferredCallback {
  return typeof value === 'function';
}

function isPromise(value: unknown): value is Promise<unknown> {
  return value instanceof Promise;
}

// Getting a dispatched result back to the client, in the shape the method's reply mode asks for:
// `deferred` resolves through the callback the dispatch returned, a promise is awaited either way,
// and an `ack` answers `'ok'` rather than the work's own result. A rejection — or a synchronous
// throw out of the dispatch itself, which the caller catches around this call — answers with the
// error text rather than leaving the caller waiting.
export function settleReply(reply: Reply, id: number, mode: ClientReplyMode, result: unknown): void {
  const resolve = (value: unknown) => {
    reply({ t: 'rpc-reply', id, result: value });
  };
  if (mode === 'deferred') {
    if (isDeferredCallback(result)) {
      result(resolve);
      return;
    }
    void Promise.resolve(result).then(resolve, (error: unknown) => {
      reply({ t: 'rpc-reply', id, error: errorText(error) });
    });
    return;
  }
  if (isPromise(result)) {
    void result.then(
      (value) => reply({ t: 'rpc-reply', id, result: mode === 'ack' ? 'ok' : value }),
      (error: unknown) => reply({ t: 'rpc-reply', id, error: errorText(error) }),
    );
    return;
  }
  reply({ t: 'rpc-reply', id, result: mode === 'ack' ? 'ok' : result });
}
