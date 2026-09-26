import { Writable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

// The request/response pair the HTTP routes are driven with, so a route can be tested for what it
// *answers* without a socket anywhere. Nothing here stands in for the route's own logic — the status
// line, the headers, the body, and the teardown are all the real code's.
//
// The response is a `Writable` rather than a plain object because `serveOpenFile` pipes a file stream
// into it with `pipeline`, which needs a real destination: `write`, `end`, `destroy`, and the error
// events that drive its teardown.

export type RecordedResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
  /** Whether `writeHead` has run — the boundary `answerRequestFailure` checks before writing again. */
  headersSent: boolean;
  /** Whether the response has been torn down, by the route or by a client walking away. */
  destroyed: boolean;
  /** Whether the body has been flushed. */
  ended: boolean;
};

/** A request carrying only what the routes read: the method, the url, and the headers. */
export function fakeRequest(
  init: { method?: string; url?: string; headers?: Record<string, string> } = {},
): IncomingMessage {
  const { method = 'GET', url = '/', headers = {} } = init;
  // No route here reads a request body; a no-op keeps the shape honest for a handler that pipes one.
  const noop = () => {};
  return { method, url, headers, on: noop, pipe: noop, setEncoding: noop, destroy: noop } as unknown as IncomingMessage;
}

export type FakeResponse = {
  res: ServerResponse;
  recorded: RecordedResponse;
  /**
   * Resolves once the response has been answered and flushed, or torn down.
   *
   * A handler is not awaited by the boundary that wraps it — `guardRequest` returns `void` and lets
   * the handler settle in the background — so a test that read the record straight after dispatching
   * would be reading it before the route had decided anything. Wait on this instead of on the call.
   */
  done: Promise<void>;
  /** A client walking away mid-body: the destination errors, which is what `pipeline` tears down on. */
  abandon: () => void;
};

/** A response that records what was answered, and can be abandoned the way a real client would. */
export function fakeResponse(): FakeResponse {
  const chunks: Buffer[] = [];
  const recorded: RecordedResponse = {
    status: 200, headers: {}, body: '', headersSent: false, destroyed: false, ended: false,
  };

  const settle = () => { recorded.body = Buffer.concat(chunks).toString('utf8'); };

  // `resolve` is idempotent, so whichever of end/destroy comes first settles this.
  const done = Promise.withResolvers<void>();

  const writable = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      callback();
    },
    final(callback) { callback(); },
    destroy(error, callback) { callback(error); },
  });

  const res = writable as unknown as ServerResponse;
  // The originals, captured before they are replaced — `destroy` in particular has to stay reachable.
  const destroyStream = writable.destroy.bind(writable);

  res.writeHead = ((status: number, headers?: Record<string, string>) => {
    recorded.status = status;
    // Lowercased, because a real response's header names always are — a case asserting on
    // `content-type` is asserting what the client sees, not how the route spelled it.
    recorded.headers = Object.fromEntries(
      Object.entries(headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
    );
    recorded.headersSent = true;
    return res;
  }) as ServerResponse['writeHead'];

  res.end = ((chunk?: unknown) => {
    if (chunk !== undefined && chunk !== null) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    recorded.ended = true;
    settle();
    done.resolve();
    return res;
  }) as ServerResponse['end'];

  res.destroy = (error?: Error) => {
    recorded.destroyed = true;
    settle();
    done.resolve();
    destroyStream(error);
    return res;
  };

  // `headersSent` is a getter on the real response, and `answerRequestFailure` reads it, so it has
  // to track what was written rather than standing in as a plain field.
  Object.defineProperty(res, 'headersSent', { get: () => recorded.headersSent });

  return {
    res,
    recorded,
    done: done.promise,
    abandon: () => { res.destroy(new Error('abandoned')); },
  };
}

// Whether this environment will let a test bind a loopback port at all.
//
// Most of what the HTTP routes do can be driven with the recorder above, but a few things genuinely
// are the socket — a WebSocket upgrade, whether a probe against a bound port is accepted. Those cases
// are not worth faking: a stub would assert that the stub works. So rather than weaken them, they ask
// this first, and skip where the sandbox says no. Where a port can be bound they run for real.
export async function loopbackBindable(): Promise<boolean> {
  const { createServer } = await import('node:net');
  return new Promise<boolean>((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.listen(0, '127.0.0.1', () => { probe.close(() => resolve(true)); });
  });
}
