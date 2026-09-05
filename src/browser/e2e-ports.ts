import { randomInt } from 'node:crypto';

// The two ports one e2e browser launch needs: the guard's, which the agent's endpoint names, and the
// browser server's own, which never leaves this process.
//
// Nothing is probed. There is no way to reserve a TCP port synchronously in Node — `listen()` defers
// the bind behind a host lookup and `address()` is `null` until that resolves — and the endpoint has
// to be known synchronously so the PTY spawn is never gated on the browser starting. That is what
// keeps this feature out of the codebase's async provisioning machinery: no placeholder tab, no
// promise that must never reject.
//
// What can be prevented synchronously is every collision Janissary causes itself. The reservation
// below is the whole mechanism: a port handed out is not handed out again until it is given back, so
// one launch's two ports are never equal and two concurrent launches never share one. A port taken
// by another process on the host between being chosen here and being bound remains a race, and it is
// not silent — the guard or the child fails to listen, the session is torn down in full, and the
// user is notified.

const FIRST_PORT = 49_152;
const PORT_COUNT = 16_384;

const reserved = new Set<number>();

export type BrowserPorts = {
  guardPort: number;
  browserPort: number;
  // Returns both to the pool. Called from the session teardown, so a long-lived server does not
  // accumulate reservations for browsers that ended hours ago.
  release: () => void;
};

// Walk forward from the drawn port to the first unreserved one, rather than redrawing. That makes
// the allocation terminate and stay bounded under any draw at all, degenerate ones included. If
// every port in the range were spoken for — 8,192 live browsers — the drawn one is handed back
// anyway: a bind that loses is already a reported, cleaned-up failure, and that is a better outcome
// than a launch never attempted.
function claimPort(drawn: number): number {
  for (let offset = 0; offset < PORT_COUNT; offset++) {
    const port = FIRST_PORT + ((drawn - FIRST_PORT + offset) % PORT_COUNT);
    if (!reserved.has(port)) {
      reserved.add(port);
      return port;
    }
  }
  return drawn;
}

/**
 * Allocate the pair. The browser's port is drawn independently rather than derived from the guard's:
 * a client holding the published endpoint knows the guard's port, and the design's claim is that
 * holding it reveals no route around the guard.
 */
export function allocateBrowserPorts(): BrowserPorts {
  const guardPort = claimPort(randomInt(FIRST_PORT, FIRST_PORT + PORT_COUNT));
  let browserPort = claimPort(randomInt(FIRST_PORT, FIRST_PORT + PORT_COUNT));
  // Only reachable through the exhausted-range fallback above, and stated unconditionally anyway:
  // a guard proxying to its own listening port is the one outcome that must be impossible.
  if (browserPort === guardPort) browserPort = FIRST_PORT + ((guardPort - FIRST_PORT + 1) % PORT_COUNT);
  return {
    guardPort,
    browserPort,
    release: () => { reserved.delete(guardPort); reserved.delete(browserPort); },
  };
}
