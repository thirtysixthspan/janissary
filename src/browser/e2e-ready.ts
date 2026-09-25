import { connect } from 'node:net';
import { E2E_LOOPBACK_HOST } from './e2e-loopback.js';
import type { E2ESession } from './e2e-session.js';

// The one thing a spawn returning does not say: that the child has bound the port it was given.
//
// `spawnBrowserChild` resolves the moment the child has been forked, and Chromium does not bind
// until `launchServer` has run inside it — a cold launch is seconds. The guard dials the instant its
// supplier answers, so without this the first connect of a tab is a refused dial rather than a slow
// one, and the client's own error handler closes it with no reason at all. Nothing here opens a
// session with the browser: the probe asks whether anything is listening and hangs up, and the guard
// makes the real connection a moment later.

// How often to look. Fast enough that a launch which is already nearly up is not held noticeably
// past it, slow enough that a cold start is a few dozen connect attempts rather than a spin.
const PROBE_INTERVAL = 25;
// How long to keep looking. Chromium's own launch times out at 30 seconds, so a child that has not
// bound by then has already failed or is about to. This is what stops a launch that hangs from
// holding a client open indefinitely: the bound ends it the same way a refusal would.
const PROBE_BOUND = 30_000;

function accepting(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: E2E_LOOPBACK_HOST, port });
    const answer = (yes: boolean): void => { socket.destroy(); resolve(yes); };
    socket.once('connect', () => answer(true));
    socket.once('error', () => answer(false));
  });
}

/**
 * Resolve once the browser is listening on `port`, and reject if it never is.
 *
 * The session is read rather than polled for a port alone because a child that fails to launch exits
 * *after* the spawn returned, and that exit is the only account of why the port is not coming. A
 * rejection here is what turns it into a close reason the client is given, instead of the bare close
 * the guard sends for a supplier that said nothing at all.
 *
 * `boundMs` is the wait's own bound, defaulted to a cold launch's worth of patience; it is a
 * parameter only so the expiry can be tested without waiting half a minute for it.
 */
export function waitForListening(session: E2ESession, port: number, boundMs = PROBE_BOUND): Promise<void> {
  const startedAt = Date.now();
  return new Promise<void>((resolve, reject) => {
    // Nothing below throws: every ending is this promise's, so the timer that schedules the next
    // probe can discard this call without leaving a rejection unowned.
    const probe = async (): Promise<void> => {
      if (session.closed) return reject(new Error('e2e browser exited before it was listening'));
      if (await accepting(port)) return resolve();
      if (Date.now() - startedAt >= boundMs) return reject(new Error('e2e browser did not start listening in time'));
      setTimeout(() => { void probe(); }, PROBE_INTERVAL);
    };
    void probe();
  });
}
