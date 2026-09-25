import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { errorText } from '../error-text.js';
import { inspectClientFrame, inspectServerFrame, type FrameVerdict } from './e2e-frame-filter.js';
import { E2E_LOOPBACK_HOST } from './e2e-loopback.js';

// The protocol filter that sits between a sandboxed agent and the browser server it drives. It is
// the only endpoint the agent is ever given (`startE2EBrowserServer` publishes this one and keeps
// the browser's own port and path inside the janissary process), and it relays Playwright protocol
// frames in both directions, judging each one with the rules in `e2e-frame-filter.ts`.
//
// This is the shape browserless arrived at for the same problem: proxy the websocket, parse each
// frame as JSON rather than substring-matching it, and tear the session down on a match. On a match
// the whole session ends — the client socket closes with 1008 and the upstream connection is
// destroyed — rather than one call failing, so there is no partial read to salvage.
//
// The upstream is asked for rather than paired at construction. A guard whose browser starts at
// launch can name it; one whose browser starts when the agent asks cannot, because the agent's first
// connect is what asks. So the browser's address arrives per client, and the client is held
// patient in the meantime — which is why `bridge` below buffers before it dials as well as after.

export type E2EGuardOptions = {
  // The published port and path — what the agent's endpoint names.
  port: number;
  wsPath: string;
  // The browser server behind it, on loopback under its own unguessable path (see
  // `e2e-loopback.ts`), asked for on each incoming client. Resolving names the live one to dial and
  // hands the client the session it was waiting for; rejecting ends that client with the reason the
  // rejection carries, and the guard stays listening so a later client asks again.
  ensureUpstream: () => Promise<string>;
  // Called once if the guard cannot listen at all (the port was taken between being picked and
  // being bound). Never called for an ordinary per-session error.
  onError?: (message: string) => void;
};

export type E2EGuardHandle = { close: () => void };

// What a client said while its browser was still being asked for, in order, released the moment the
// upstream opens. A `RawData` rather than the text it decodes to, so a relayed frame is the frame
// that arrived — binary flag and encoding included.
type Pending = { data: RawData; isBinary: boolean }[];

// One frame's verdict and what to do when it passes. A refusal ends the session; the `endSession`
// below takes the upstream as it stands, which is nothing at all while the browser is still starting.
type Judge = (verdict: FrameVerdict, forward: () => void) => void;

// `ws` hands a text frame back as a Buffer and a binary one as a Buffer, ArrayBuffer, or Buffer
// array depending on how it arrived. All of them decode the same way, and a frame that is not valid
// UTF-8 JSON is judged unreadable by the filter rather than relayed.
function frameText(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}

// Close code 1008 is "policy violation", which is what this is. The reason rides in the close frame
// and must stay short — the protocol caps it at 123 bytes — so the filter's reasons are phrases.
const POLICY_VIOLATION = 1008;

// The one case where the reason is janissary's own sentence rather than a filter phrase is a browser
// that would not start, and that can be a filesystem error with a path in it. Bounded to fit the
// close frame regardless; the client only needs to know the browser did not come up, and the full
// account reaches the user through the ordinary death report rather than through here.
const MAX_CLOSE_REASON = 120;

function launchFailure(reason: unknown): string {
  const text = errorText(reason);
  return text.length <= MAX_CLOSE_REASON ? text : text.slice(0, MAX_CLOSE_REASON);
}

function endSession(client: WebSocket, upstream: WebSocket | undefined, reason: string): void {
  try { client.close(POLICY_VIOLATION, reason); } catch { /* already closing */ }
  upstream?.terminate();
}

// The browser side of one session, once it has been named. What the client said in the meantime goes
// out in order, and after that the two directions are the plain relay they have always been.
// Closing either side closes the other, so a session never outlives half of itself. Frames are
// forwarded verbatim, binary flag included — the guard never re-encodes what it did not author.
function dialUpstream(client: WebSocket, upstreamUrl: string, pending: Pending, judge: Judge): WebSocket {
  const upstream = new WebSocket(upstreamUrl);
  upstream.on('open', () => {
    for (const frame of pending) upstream.send(frame.data, { binary: frame.isBinary });
    pending.length = 0;
  });
  upstream.on('message', (data: RawData, isBinary: boolean) => {
    judge(inspectServerFrame(frameText(data)), () => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
    });
  });
  upstream.on('close', () => { client.close(); });
  upstream.on('error', () => { client.close(); });
  return upstream;
}

// One client connection: ask where the browser is, hold anything the client says until it answers,
// and relay both directions through the filter afterwards. Frames are judged on arrival either way,
// so a `file:` URL is refused just as promptly while the browser is still starting as it is once it
// is up — the buffering is for the legal frames, not as a way to defer the judgement.
function bridge(client: WebSocket, ensureUpstream: () => Promise<string>): void {
  const pending: Pending = [];
  let upstream: WebSocket | undefined;
  let refused = false;

  const judge: Judge = (verdict, forward) => {
    if (verdict.blocked) endSession(client, upstream, verdict.reason);
    else forward();
  };

  client.on('message', (data: RawData, isBinary: boolean) => {
    judge(inspectClientFrame(frameText(data)), () => {
      if (upstream?.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
      else if (!refused) pending.push({ data, isBinary });
    });
  });
  client.on('close', () => { upstream?.terminate(); });
  client.on('error', () => { upstream?.terminate(); });

  // A browser that has not been asked for yet is an ordinary state, not a failure, so the client's
  // handshake is held here rather than refused. A client that has already gone by the time the
  // browser is up is not dialed for. A supplier that rejects ends this session and only this one.
  void (async (): Promise<void> => {
    try {
      const upstreamUrl = await ensureUpstream();
      if (client.readyState === WebSocket.OPEN) upstream = dialUpstream(client, upstreamUrl, pending, judge);
    } catch (error) {
      refused = true;
      endSession(client, upstream, launchFailure(error));
    }
  })();
}

/**
 * Start the guard. It binds the shared loopback address only and accepts upgrades on `wsPath` alone
 * — `ws` answers any other path with a 400, so the internal path behind it is not reachable by
 * guessing even by a client that already holds the published port. Each client that gets through asks
 * its own supplier where the browser is, so the published endpoint can outlive every browser behind
 * it without ever being republished.
 */
export function startE2EGuard(options: E2EGuardOptions): E2EGuardHandle {
  const server = new WebSocketServer({ host: E2E_LOOPBACK_HOST, port: options.port, path: options.wsPath });
  let closed = false;

  server.on('connection', (client: WebSocket) => { bridge(client, options.ensureUpstream); });
  server.on('error', (error: Error) => {
    if (closed) return;
    options.onError?.(`e2e browser guard failed to listen: ${error.message}`);
  });

  return {
    close: () => {
      if (closed) return;
      closed = true;
      for (const client of server.clients) client.terminate();
      server.close();
    },
  };
}
