import { randomInt } from 'node:crypto';
import { BROWSER_PORT_BAND_COUNT, BROWSER_PORT_BAND_FIRST } from '../sandbox/browser-ports.js';

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
// two concurrent launches never share one. A port taken by another process on the host between being
// chosen here and being bound remains a race, and it is not silent — the guard or the child fails to
// listen, the session is torn down in full, and the user is notified.
//
// The two ports come from disjoint ranges, which is a containment boundary and not just tidiness.
// Every browser port is drawn from the reserved band at the tail of the dynamic range, and the
// Seatbelt harness profile denies that whole band statically (see `src/sandbox/browser-ports.ts`),
// so no confined harness can reach any browser. Guard ports come from everything below the band and
// stay reachable, because the guard is the route the harness is supposed to take.

const FIRST_PORT = 49_152;
const PORT_COUNT = 16_384;
// The band is the tail of the dynamic range, so what is left for guards is one contiguous interval.
const GUARD_COUNT = PORT_COUNT - BROWSER_PORT_BAND_COUNT;

const reserved = new Set<number>();

export type BrowserPorts = {
  guardPort: number;
  browserPort: number;
  // Returns both to the pool. Called from the session teardown, so a long-lived server does not
  // accumulate reservations for browsers that ended hours ago.
  release: () => void;
};

// Walk forward from the drawn port to the first unreserved one in the range, rather than redrawing.
// That makes the allocation terminate and stay bounded under any draw at all, degenerate ones
// included. A range that is entirely spoken for returns undefined rather than handing back the drawn
// port: for the browser band that fallback would bind a port no profile denies, which is the hole
// the band exists to close.
//
// The offset is normalized into the range before the walk. JavaScript's `%` keeps the sign of its
// left operand, so a draw below `first` would otherwise walk backwards out of the range entirely.
function claimPort(drawn: number, first: number, count: number): number | undefined {
  const start = (((drawn - first) % count) + count) % count;
  for (let offset = 0; offset < count; offset++) {
    const port = first + ((start + offset) % count);
    if (!reserved.has(port)) {
      reserved.add(port);
      return port;
    }
  }
  return undefined;
}

function exhausted(what: string, first: number, count: number): Error {
  return new Error(`no free ${what} port between ${first} and ${first + count - 1}`);
}

/**
 * Allocate the pair. The browser's port is drawn independently rather than derived from the guard's:
 * a client holding the published endpoint knows the guard's port, and the design's claim is that
 * holding it reveals no route around the guard. Drawing the two from disjoint ranges also means the
 * guard can never end up proxying to its own listening port.
 *
 * Throws when the band holds no free port, rather than falling back outside it. The band caps how
 * many browsers can run at once, and a launch past that cap has to fail where it can be reported —
 * `startE2EBrowserServer` turns this into an `onGone` notification.
 */
export function allocateBrowserPorts(): BrowserPorts {
  const browserPort = claimPort(
    randomInt(BROWSER_PORT_BAND_FIRST, BROWSER_PORT_BAND_FIRST + BROWSER_PORT_BAND_COUNT),
    BROWSER_PORT_BAND_FIRST, BROWSER_PORT_BAND_COUNT,
  );
  if (browserPort === undefined) {
    throw exhausted('e2e browser', BROWSER_PORT_BAND_FIRST, BROWSER_PORT_BAND_COUNT);
  }
  const guardPort = claimPort(randomInt(FIRST_PORT, FIRST_PORT + GUARD_COUNT), FIRST_PORT, GUARD_COUNT);
  if (guardPort === undefined) {
    reserved.delete(browserPort);
    throw exhausted('e2e guard', FIRST_PORT, GUARD_COUNT);
  }
  return {
    guardPort,
    browserPort,
    release: () => { reserved.delete(guardPort); reserved.delete(browserPort); },
  };
}
