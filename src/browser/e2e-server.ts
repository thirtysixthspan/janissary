import { makeToken } from '../security.js';
import { errorText } from '../error-text.js';
import { startE2EGuard } from './e2e-guard.js';
import { loopbackWsUrl } from './e2e-loopback.js';
import { allocateBrowserPorts, type BrowserPorts } from './e2e-ports.js';
import { waitForListening } from './e2e-ready.js';
import { allocateBrowserScratch } from './e2e-scratch.js';
import { newSession, stopSession, type E2ESession } from './e2e-session.js';
import { spawnBrowserChild } from './e2e-spawn.js';
import { playwrightPackagePaths } from './playwright-paths.js';

// Lifecycle orchestration for one harness tab's e2e browser: the guard, the confined child behind
// it, and the scratch workspace the child lives in. Lives in `src/browser/` because it is browser
// machinery and because both the local harness manager and the remote server import it. It holds no
// label-keyed state — the caller owns the handle it returns and disposes it (see `HarnessRuntime`).
//
// Two start sequences, one per decision about when the Chromium comes up. Both publish the same
// endpoint, mint the same two unguessable paths, and report through the same `onGone`; they differ
// only in whether the child is spawned here at launch or by the guard on the agent's first connect.

export type E2EBrowserHandle = {
  // Idempotent, and safe before the child has finished starting — or before anything has been asked
  // to start it. Stops the guard, kills the child, and removes the browser workspace and its temp
  // sibling. A browser that already ended on its own has released everything but that pair at the
  // moment it ended, so this is then a no-op — the directory it died in is deliberately kept to be
  // read, and the next start sweeps it.
  close: () => void;
};

export type E2EBrowserServer = {
  // `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT`, merged into the harness's spawn
  // environment by the caller. Empty when no browser could be started at all, so the harness
  // launches without one rather than with an endpoint naming nothing.
  env: NodeJS.ProcessEnv;
  handle: E2EBrowserHandle;
};

export type E2EBrowserOptions = {
  // The tab's label. It names the scratch directory for a human reading a directory listing and
  // nothing more — the directory itself is allocated exclusively (see `e2e-scratch.ts`).
  label: string;
  // Invoked once when the browser is gone for a reason the user did not ask for: a child that
  // exits, a child that never starts, or a guard that cannot listen. Never invoked after `close()`,
  // and never before everything that launch acquired has been released.
  //
  // `message` is the report, bounded to stay readable where it is displayed. `log` is the same
  // account with the browser's output kept whole, for a caller that persists it; it is undefined
  // when the browser said nothing at all, and so is nothing to keep.
  onGone: (message: string, log?: string) => void;
};

// The one failure that happens before anything is acquired: the browser port band is full, so this
// host is already running as many browsers as it can. There is no session to tear down and no
// endpoint to hand back, so the notification goes straight to `onGone` rather than through
// `stopSession`, and the harness launches with no browser variables at all.
function portsOrReport(options: E2EBrowserOptions): BrowserPorts | undefined {
  try {
    return allocateBrowserPorts();
  } catch (error) {
    options.onGone(`e2e browser failed to start: ${errorText(error)}`);
    return undefined;
  }
}

// The environment the harness is spawned with, complete before any browser exists: the endpoint
// names the guard, and the guard is what the agent connects to either way.
function browserEnv(guardPort: number, publishedPath: string): NodeJS.ProcessEnv {
  return {
    JANISSARY_BROWSER_WS_ENDPOINT: loopbackWsUrl(guardPort, publishedPath),
    JANISSARY_PLAYWRIGHT: playwrightPackagePaths().entry,
  };
}

/**
 * Start a browser for one harness tab and return the environment it is reached through, without
 * waiting for anything. A script that connects within the first fraction of a second may need one
 * retry; a launch that fails outright is reported through `onGone` after the fact rather than as a
 * notice on the tab's first frame, since the variable is already set by then.
 *
 * It never throws. The caller is part-way through building a tab, and a browser that could not be
 * acquired is a notification, not a failed tab — so a throw anywhere in the sequence below is
 * reported through `onGone` and rolled back against whatever had already been acquired.
 */
export function startE2EBrowserServer(options: E2EBrowserOptions): E2EBrowserServer {
  const ports = portsOrReport(options);
  if (!ports) return { env: {}, handle: { close: () => {} } };
  // Two unguessable paths, not one: the agent is given the first and the second never leaves this
  // process, so holding the published endpoint does not reveal a route around the guard.
  const publishedPath = `/${makeToken()}`;
  const internalPath = `/${makeToken()}`;

  const session = newSession(options.onGone);
  session.ports = ports;
  try {
    session.scratch = allocateBrowserScratch(options.label);
    session.guard = startE2EGuard({
      port: ports.guardPort, wsPath: publishedPath,
      ensureUpstream: () => Promise.resolve(loopbackWsUrl(ports.browserPort, internalPath)),
      onError: (message) => stopSession(session, message),
    });
    session.child = spawnBrowserChild(session, ports.browserPort, internalPath);
  } catch (error) {
    stopSession(session, `e2e browser failed to start: ${errorText(error)}`);
  }

  return { env: browserEnv(ports.guardPort, publishedPath), handle: { close: () => stopSession(session) } };
}

// What a lazily-started tab holds between its guard and whichever browser is behind it right now.
// The guard and the ports belong to the tab and outlive every browser; each browser is a session of
// its own, so a death is torn down, reported, and forgotten exactly as it always was, and the next
// connect builds a fresh one. A record rather than a class because nothing here has behavior beyond
// the two functions below it.
type LazyBrowser = {
  session: E2ESession;
  ports: BrowserPorts;
  internalPath: string;
  label: string;
  // The live browser, or undefined when none is running. Read through `closed` rather than unset,
  // because a browser that died on its own leaves the record behind and only the flag says so — and
  // set as soon as the child is forked rather than once it is listening, so a tab that closes during
  // a launch closes this child like any other.
  generation: E2ESession | undefined;
  // The start in flight, shared by every client that arrives while one is running. Cleared once it
  // settles, so a start that failed costs the next connect nothing and a start that succeeded is
  // found through `generation` instead.
  starting: Promise<string> | undefined;
};

function upstreamOf(lazy: LazyBrowser): string {
  return loopbackWsUrl(lazy.ports.browserPort, lazy.internalPath);
}

/**
 * Start a browser for one harness tab exactly as the eager start does, except that no browser is
 * started: the guard is listening from the first moment, holding the published endpoint steady, and
 * the Chromium behind it is spawned when a client first connects to that endpoint. The connect is
 * the request and its own success is the answer, and it is held while the browser comes up, so the
 * launch costs a `-b` tab nothing until the agent asks for a browser.
 *
 * The endpoint never changes — not across a start, a death, or the restart behind it — so the
 * environment handed to the harness at spawn is complete and final. A browser that dies is reported
 * exactly as any other death is, the guard keeps listening, and the next connect spawns a fresh
 * browser behind the same endpoint. It never throws, for the same reason the eager start does not.
 */
export function startLazyE2EBrowserServer(options: E2EBrowserOptions): E2EBrowserServer {
  const ports = portsOrReport(options);
  if (!ports) return { env: {}, handle: { close: () => {} } };
  const publishedPath = `/${makeToken()}`;
  const internalPath = `/${makeToken()}`;

  const session = newSession(options.onGone);
  session.ports = ports;
  const lazy: LazyBrowser = { session, ports, internalPath, label: options.label, generation: undefined, starting: undefined };
  // Everything a tab owns, released in one order whatever asked. The guard first, so nothing can ask
  // for a browser while this is tearing one down, and the ports with it — a port still reserved for a
  // guard that has stopped listening is a port a later launch would be refused. Then whatever browser
  // is running, ended the way a browser the user closed ends: killed, with its directory removed and
  // nothing reported. Clearing the record first is what makes a second call a no-op.
  const teardown = (): void => {
    const { generation } = lazy;
    lazy.generation = undefined;
    stopSession(lazy.session);
    if (generation) stopSession(generation);
  };
  try {
    session.guard = startE2EGuard({
      port: ports.guardPort, wsPath: publishedPath,
      ensureUpstream: () => ensureUpstream(lazy),
      // A guard that cannot listen is the fourth ending, and it leaves a browser behind it that
      // nothing can reach — so it runs the same release a tab closing does. The message goes through
      // the tab session, whose report the human reads; the generation behind it is released silently,
      // because the failure has already been said once.
      onError: (message) => { stopSession(session, message); teardown(); },
    });
  } catch (error) {
    stopSession(session, `e2e browser failed to start: ${errorText(error)}`);
  }

  return { env: browserEnv(ports.guardPort, publishedPath), handle: { close: teardown } };
}

// The connect-triggered start. One in-flight start serves every client that arrives while it runs —
// each of them gets its own upstream session once it is up — and a browser that is already running
// needs no start at all, so this is idempotent rather than a request that spends something.
async function ensureUpstream(lazy: LazyBrowser): Promise<string> {
  if (lazy.session.closed) throw new Error('e2e browser is no longer available');
  // The in-flight start is asked about first, because `generation` is set for the whole of a launch
  // and a client arriving while the child is still binding must wait for that launch rather than be
  // handed an address nothing is listening on yet.
  lazy.starting ??= lazy.generation && !lazy.generation.closed ? Promise.resolve(upstreamOf(lazy)) : startBrowser(lazy);
  // A start that has run is no longer the answer to anything: a browser that came up answers from
  // `generation`, and one that failed must leave nothing behind for a later client to inherit as
  // though it had already been refused.
  const starting = lazy.starting;
  try {
    return await starting;
  } finally {
    lazy.starting = undefined;
  }
}

// A throw here is what ends the client that asked: the guard closes that session with this reason and
// stays listening, so the next connect tries again against the same endpoint and the same ports. The
// death is reported on the ordinary path first, which is what puts it in front of the user.
//
// A start is not finished when the child has been forked but when the child is listening, because the
// guard dials the moment this resolves and a dial into a port Chromium has not bound yet is a refused
// connection rather than a slow one. The wait is inside the `try` on purpose: a child that dies
// during it and a launch that never binds are the same failure to every caller above, and this
// sequence already reports one and closes one client with it.
async function startBrowser(lazy: LazyBrowser): Promise<string> {
  const generation = newSession(lazy.session.onGone);
  try {
    generation.scratch = allocateBrowserScratch(lazy.label);
    generation.child = spawnBrowserChild(generation, lazy.ports.browserPort, lazy.internalPath);
    // Recorded before the wait, not after it: a tab that closes while the browser is still coming up
    // closes this record like any other, and a child nothing can reach would be one left running.
    lazy.generation = generation;
    await waitForListening(generation, lazy.ports.browserPort);
  } catch (error) {
    stopSession(generation, `e2e browser failed to start: ${errorText(error)}`);
    throw error;
  }
  return upstreamOf(lazy);
}
