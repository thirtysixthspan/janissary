import type { RpcCall } from '@shared/protocol';

// What a request is answered with when its connection ends before the reply does. Nonempty, because
// `saveFile`'s caller displays it and an empty string reads there as success.
const CONNECTION_ENDED = 'connection closed';

// What `request` resolves with: the server's value, or why there isn't one. `error` is absent only
// for a socket that was never open — every other failure (a connection that ended, a server refusal)
// carries the text, so a caller with somewhere to show it can tell those apart from the silence a
// closed socket has always resolved as.
export type RequestResult<T> = { ok: true; value: T } | { ok: false; error?: string };

// The request half of the socket client: the id counter, the map of replies still owed, and every way
// a request can end. The socket is read through a function rather than captured, so a reconnect that
// swaps it is seen by the next call.
export class RpcExchange {
  private nextId = 1;
  private pending = new Map<number, (result: unknown, error?: string) => void>();

  constructor(private socket: () => WebSocket) {}

  // Invoke a pending request's callback once and drop it. Every way a request can finish — its
  // reply, the connection ending, a send that threw — goes through here, so an id is answered at
  // most once and a late reply for an already-settled id finds nothing and is dropped.
  settle(id: number, result: unknown, error?: string): void {
    const callback = this.pending.get(id);
    if (!callback) return;
    this.pending.delete(id);
    callback(result, error);
  }

  // Answer everything still waiting with a connection failure. A closed socket will never deliver
  // those replies, and a promise left pending strands the dialog or busy indicator built on it.
  // The map is swapped out before any callback runs, so this is idempotent — the close listener and
  // the client's own dispose can both call it, and dispose does both, since closing the socket fires
  // the close event in its own turn.
  //
  // Nothing is resent. A request whose reply was lost may still have been carried out by the server,
  // so replaying a mutating call could apply it twice.
  drain(): void {
    const outstanding = this.pending;
    this.pending = new Map();
    for (const callback of outstanding.values()) callback(undefined, CONNECTION_ENDED);
  }

  // Hand a registered request to the socket. A `send` that throws settles it here rather than
  // leaving its callback in the map waiting for a reply nothing ever asked for.
  private dispatch(id: number, payload: string): void {
    try {
      this.socket().send(payload);
    } catch {
      this.settle(id, undefined, CONNECTION_ENDED);
    }
  }

  send(call: RpcCall): void {
    if (this.socket().readyState === WebSocket.OPEN) {
      this.socket().send(JSON.stringify({ t: 'rpc', id: this.nextId++, ...call }));
    }
  }

  // Send an RPC and resolve with the server's reply. Callers branch on `ok` — what to show for a
  // failed request is each surface's own decision, not this method's — and on whether `error` is
  // present when it is not: absent means the socket was never open, present means the connection
  // ended before the reply arrived or the server refused the request.
  request<T>(call: RpcCall): Promise<RequestResult<T>> {
    const id = this.nextId++;
    return new Promise<RequestResult<T>>((resolve) => {
      if (this.socket().readyState !== WebSocket.OPEN) { resolve({ ok: false }); return; }
      this.pending.set(id, (r, error) => resolve(error === undefined ? { ok: true, value: r as T } : { ok: false, error }));
      this.dispatch(id, JSON.stringify({ t: 'rpc', id, ...call }));
    });
  }
}
