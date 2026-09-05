import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { inspectClientFrame, inspectServerFrame, type FrameVerdict } from './e2e-frame-filter.js';
import { E2E_LOOPBACK_HOST, loopbackWsUrl } from './e2e-loopback.js';

// The protocol filter that sits between a sandboxed agent and the browser server it drives. It is
// the only endpoint the agent is ever given (`startE2EBrowserServer` publishes this one and keeps
// the browser's own port and path inside the janissary process), and it relays Playwright protocol
// frames in both directions, judging each one with the rules in `e2e-frame-filter.ts`.
//
// This is the shape browserless arrived at for the same problem: proxy the websocket, parse each
// frame as JSON rather than substring-matching it, and tear the session down on a match. On a match
// the whole session ends — the client socket closes with 1008 and the upstream connection is
// destroyed — rather than one call failing, so there is no partial read to salvage.

export type E2EGuardOptions = {
  // The published port and path — what the agent's endpoint names.
  port: number;
  wsPath: string;
  // The browser server behind it, on loopback under its own unguessable path.
  upstreamPort: number;
  upstreamPath: string;
  // Called once if the guard cannot listen at all (the port was taken between being picked and
  // being bound). Never called for an ordinary per-session error.
  onError?: (message: string) => void;
};

export type E2EGuardHandle = { close: () => void };

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

function endSession(client: WebSocket, upstream: WebSocket, reason: string): void {
  try { client.close(POLICY_VIOLATION, reason); } catch { /* already closing */ }
  upstream.terminate();
}

// One client connection: open an upstream connection to the browser server for it, hold anything the
// client says until that is ready, and relay both directions through the filter afterwards. Closing
// either side closes the other, so a session never outlives half of itself. Frames are forwarded
// verbatim, binary flag included — the guard never re-encodes what it did not author.
function bridge(client: WebSocket, upstreamUrl: string): void {
  const upstream = new WebSocket(upstreamUrl);
  const pending: { data: RawData; isBinary: boolean }[] = [];

  const judged = (verdict: FrameVerdict, forward: () => void): void => {
    if (verdict.blocked) endSession(client, upstream, verdict.reason);
    else forward();
  };

  upstream.on('open', () => {
    for (const frame of pending) upstream.send(frame.data, { binary: frame.isBinary });
    pending.length = 0;
  });
  upstream.on('message', (data: RawData, isBinary: boolean) => {
    judged(inspectServerFrame(frameText(data)), () => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
    });
  });
  upstream.on('close', () => { client.close(); });
  upstream.on('error', () => { client.close(); });

  client.on('message', (data: RawData, isBinary: boolean) => {
    judged(inspectClientFrame(frameText(data)), () => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
      else pending.push({ data, isBinary });
    });
  });
  client.on('close', () => { upstream.terminate(); });
  client.on('error', () => { upstream.terminate(); });
}

/**
 * Start the guard. It binds the shared loopback address only and accepts upgrades on `wsPath` alone
 * — `ws` answers any other path with a 400, so the internal path behind it is not reachable by
 * guessing even by a client that already holds the published port. It dials upstream at that same
 * address, which is the one the browser server is told to listen on (see `e2e-loopback.ts`).
 */
export function startE2EGuard(options: E2EGuardOptions): E2EGuardHandle {
  const upstreamUrl = loopbackWsUrl(options.upstreamPort, options.upstreamPath);
  const server = new WebSocketServer({ host: E2E_LOOPBACK_HOST, port: options.port, path: options.wsPath });
  let closed = false;

  server.on('connection', (client: WebSocket) => { bridge(client, upstreamUrl); });
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
