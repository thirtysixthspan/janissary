import { RemoteServer } from './serve.js';

// Starting `janus remote-serve` as a process: raw mode, the signal wiring, and the server itself.
// Split out of `serve.ts` to keep that file to the frame loop.

// SIGHUP is what arrives when the ssh channel drops; the other two cover an ordinary kill. The two
// facts used to be one — all three meant the session was over and its workspace clone went with it —
// and are now deliberately different. A dropped channel is not evidence the user is finished with
// the session, only that the transport went, so SIGHUP parks the peer and waits to be attached
// (`DetachedPeer`, `REMOTE_DETACH_TIMEOUT_MS`). A signal aimed at this process is evidence: SIGTERM
// and SIGINT still end the session and remove the clone, as does the local side's explicit
// `shutdown` frame. Removing the SIGHUP branch would silently restore destroy-on-disconnect, which
// is the behavior detachable sessions exist to end.
export const CHANNEL_SIGNALS = ['SIGHUP', 'SIGTERM', 'SIGINT'] as const;

// Registration is injectable so the signal wiring can be exercised without raising real signals.
export function wireShutdown(
  server: RemoteServer,
  on: (signal: string, handler: () => void) => void = (signal, handler) => { process.on(signal as NodeJS.Signals, handler); },
): void {
  for (const signal of CHANNEL_SIGNALS) on(signal, () => {
    // The lost-transport signal parks the session; the two that mean someone ended this process end
    // it. See `CHANNEL_SIGNALS` above for why those stopped being the same answer.
    if (signal === 'SIGHUP') server.detach();
    else server.shutdown(0);
  });
}

// The root is not resolved here: the handshake goes out at once, and the first `provision` or
// `attach` settles the root (see `serve-root.ts`), so a root that cannot be used is answered over
// the channel instead of ending this process before the handshake.
export function runRemoteServer(pathArgument: string | undefined): void {
  // Raw mode so the remote tty's line discipline neither echoes the framed input nor rewrites it.
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  const server = new RemoteServer(pathArgument);
  wireShutdown(server);
  server.listen();
}
