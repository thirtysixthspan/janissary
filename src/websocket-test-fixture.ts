import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';

// A `ws` socket with the frames and the close recorded, so a relay can be driven end to end without
// a listener anywhere.
//
// This is not a stub of the thing under test. The frame filter, the ordering, the buffering and the
// close reasons are the real `e2e-guard.ts` code running against a socket that behaves like one; what
// is replaced is the operating system's byte pipe underneath it. The one thing a fake cannot prove is
// the handshake itself, which is why the upgrade case is left to a real listener.

export type SentFrame = { data: string | Buffer; isBinary: boolean };

export type FakeSocket = {
  socket: WebSocket;
  /** Everything sent out, in order, with the binary flag each frame was sent under. */
  sent: SentFrame[];
  /** The close code and reason this socket was closed with, or `undefined` if it never was. */
  closed: { code: number; reason: string } | undefined;
  /** Whether it was hard-killed rather than closed politely. */
  terminated: boolean;
  /** The raw text of everything sent out. */
  texts: () => string[];
  /** Deliver a frame in, as if the far end had sent one. */
  receive: (data: string | Buffer, isBinary?: boolean) => void;
  /** Back to the state a client is in while its browser is still being asked for. */
  connecting: () => void;
};

// `ws`'s own states, taken from `ws` rather than restated: the guard compares `readyState` against
// `WebSocket.OPEN`, and a stand-in that invented its own numbers would relay nothing.

export function fakeSocket(): FakeSocket {
  // An `EventEmitter` and not an `EventTarget`, because that is what a `ws` socket *is*: the code under
  // test subscribes with `on`/`once` and the guard reads its arguments positionally. A DOM-shaped
  // stand-in would not be the thing being faked.
  // eslint-disable-next-line unicorn/prefer-event-target
  const emitter = new EventEmitter();
  const sent: SentFrame[] = [];
  const record: FakeSocket = {
    socket: undefined as unknown as WebSocket,
    sent,
    closed: undefined,
    terminated: false,
    texts: () => sent.map((frame) => (Buffer.isBuffer(frame.data) ? frame.data.toString('utf8') : frame.data)),
    receive: (data, isBinary = false) => { emitter.emit('message', data, isBinary); },
    connecting: () => { state = WebSocket.CONNECTING; },
  };

  const socket = emitter as unknown as WebSocket;
  record.socket = socket;
  // `readyState` is readonly on the real type, so the state lives here and the socket reads it.
  let state: number = WebSocket.OPEN;
  Object.defineProperty(socket, 'readyState', { get: () => state });
  // Already connected, and told so on the next tick rather than synchronously — a real socket's `open`
  // always lands after the code that dialled it has finished registering handlers, and the guard
  // releases the frames it buffered on exactly that event. Emitting it inline would flush nothing.
  setImmediate(() => { emitter.emit('open'); });

  // `ws` overloads `send` for its callback and options forms; the relay only ever uses the options
  // one, so this stands in for the whole overloaded signature.
  socket.send = ((data: string | Buffer, options?: { binary?: boolean }) => {
    sent.push({ data, isBinary: options?.binary ?? false });
  }) as WebSocket['send'];

  // `ws` sends the reason as a Buffer in the close event, which is what the guard's refusal cases read.
  // Closing a socket that has already closed emits nothing — the guard closes the client and destroys
  // the upstream, whose own close calls back to close the client again, and a fake that re-announced
  // every close would bounce between the two forever.
  socket.close = (code?: number, reason?: string | Buffer) => {
    if (state === WebSocket.CLOSED) return;
    state = WebSocket.CLOSED;
    record.closed = {
      code: code ?? 1005,
      reason: (Buffer.isBuffer(reason) ? reason.toString('utf8') : reason) ?? '',
    };
    emitter.emit('close', record.closed.code, Buffer.from(record.closed.reason));
  };

  socket.terminate = () => {
    if (state === WebSocket.CLOSED) return;
    state = WebSocket.CLOSED;
    record.terminated = true;
    emitter.emit('close', 1006, Buffer.alloc(0));
  };

  return record;
}

/** The close this socket was ended with, once it has been. */
export function closedWith(record: FakeSocket): Promise<{ code: number; reason: string }> {
  const already = record.closed;
  if (already) return Promise.resolve(already);
  return new Promise((resolve) => {
    const poll = (): void => {
      if (record.closed) resolve(record.closed);
      else setTimeout(poll, 1);
    };
    poll();
  });
}
