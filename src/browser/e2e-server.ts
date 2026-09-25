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
// One acquisition sequence, and one decision a caller makes about it: whether to ask for a browser
// now (`startE2EBrowserServer`) or leave that to the AI's first connect (`startLazyE2EBrowserServer`).
// Both publish the same endpoint, mint the same two unguessable paths, and report through the same
// `onGone`; they differ only in whether the child is spawned by the kick or by a client.

export type E2EBrowserHandle = {
  // Idempotent, and safe before anything has been asked to start. Stops the guard, kills whatever
  // browser is running, and removes the browser workspace and its temp sibling. A browser that
  // already ended on its own has released its own half at the moment it ended, and deliberately kept
  // the directory it died in so it can be read — but the guard and the ports are the tab's and go
  // back here, so a tab whose browser has died is not a tab still holding a browser-band port.
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
  // Invoked when a browser is gone for a reason the user did not ask for: a child that exits, a
  // child that never starts, or a guard that cannot listen — once per browser, so a tab that is
  // given several over its life hears about each. Invoked once more, and only once, when a tab has
  // asked for browsers often enough that it will not be given another. Never invoked after `close()`,
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
 * Start a browser for one harness tab now rather than on the AI's first connect, and return the
 * environment it is reached through without waiting for anything. Everything this tab owns is
 * acquired exactly as the connect-triggered start acquires it, and the only difference is the kick
 * below: the browser is asked for here instead of being left to the first client.
 *
 * It never throws. The caller is part-way through building a tab, and a browser that could not be
 * acquired is a notification, not a failed tab — so a failure anywhere in the sequence is reported
 * through `onGone`, rolled back against whatever had already been acquired, and swallowed here. A
 * launch that fails outright is reported after the fact rather than as a notice on the tab's first
 * frame, since the variable is already set by then.
 */
export function startE2EBrowserServer(options: E2EBrowserOptions): E2EBrowserServer {
  return buildE2EBrowserServer(options, (lazy) => {
    void ensureUpstream(lazy).catch(() => {
      // Reported through `onGone` and already ended the client that asked, by the same `stopSession`
      // the connect-triggered path reports through. Nothing is left to say about it here.
    });
  });
}

/**
 * Start a browser for one harness tab only when the AI first asks for it: the guard is listening
 * from the first moment, holding the published endpoint steady, and the Chromium behind it is
 * spawned when a client first connects to that endpoint. The connect is the request and its own
 * success is the answer, and it is held while the browser comes up, so the launch costs a `-b` tab
 * nothing until the agent asks for a browser.
 *
 * The endpoint never changes — not across a start, a death, or the restart behind it — so the
 * environment handed to the harness at spawn is complete and final. A browser that dies is reported
 * exactly as any other death is, the guard keeps listening, and the next connect spawns a fresh
 * browser behind the same endpoint. It never throws, for the same reason the eager start does not.
 */
export function startLazyE2EBrowserServer(options: E2EBrowserOptions): E2EBrowserServer {
  return buildE2EBrowserServer(options);
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
  // Consecutive generations that ended in a report, judged when the next one is asked for rather
  // than when they died: nothing watches a live child, and a client asking again is the only moment
  // a dead one is noticed. A generation still here is a browser in use, and one found dead this soon
  // after it was spawned is a start that did not take — which is what the budget is made of.
  failures: number;
  // Whether the tab has already been told the budget is spent. The one report that ends it, since
  // `stopSession` is not what delivers it: nothing is being released, only said.
  reported: boolean;
  // When the generation behind the guard was spawned, which is what tells the two apart.
  spawnedAt: number;
};

// How many starts may end in a report before a tab stops being given a browser at all, and how long
// a generation has to be up for its own death not to count against that. A browser that came up and
// was used is not a failed start; a browser that dies the moment it is asked for is, and a script
// that retries its connect would otherwise spawn one per attempt, forever.
const RESTART_LIMIT = 3;
const UPTIME_RESET = 30_000;
// What a client is told once the budget is gone, and what the human is told, in the same words.
const WILL_NOT_RESTART = 'e2e browser will not be restarted';

function upstreamOf(lazy: LazyBrowser): string {
  return loopbackWsUrl(lazy.ports.browserPort, lazy.internalPath);
}

/**
 * The one acquisition sequence: two ports, two unguessable paths, a guard in front, and a teardown
 * behind. `kick` is the whole difference between the two entry points — the eager one asks for a
 * browser here, the lazy one leaves it to the first connect — and it runs after the guard is
 * listening, so a browser is never started against a tab that has already lost its endpoint.
 */
function buildE2EBrowserServer(options: E2EBrowserOptions, kick?: (lazy: LazyBrowser) => void): E2EBrowserServer {
  const ports = portsOrReport(options);
  if (!ports) return { env: {}, handle: { close: () => {} } };
  // Two unguessable paths, not one: the agent is given the first and the second never leaves this
  // process, so holding the published endpoint does not reveal a route around the guard.
  const publishedPath = `/${makeToken()}`;
  const internalPath = `/${makeToken()}`;

  const session = newSession(options.onGone);
  session.ports = ports;
  const lazy: LazyBrowser = {
    session, ports, internalPath, label: options.label,
    generation: undefined, starting: undefined, failures: 0, reported: false, spawnedAt: 0,
  };
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
  kick?.(lazy);

  return { env: browserEnv(ports.guardPort, publishedPath), handle: { close: teardown } };
}

// What the generation behind the guard did, counted as it is found rather than as it ends. Found
// dead, it is either a start that did not take or a browser that has been used; a generation outliving
// the interval is the second, and it makes the whole budget whole again. The record is cleared as it
// is judged, so one death is never counted twice by two clients arriving together.
function noteFailure(lazy: LazyBrowser): void {
  const { generation } = lazy;
  if (!generation?.closed) return;
  lazy.generation = undefined;
  lazy.failures = Date.now() - lazy.spawnedAt < UPTIME_RESET ? lazy.failures + 1 : 0;
}

// The connect-triggered start. One in-flight start serves every client that arrives while it runs —
// each of them gets its own upstream session once it is up — and a browser that is already running
// needs no start at all, so this is idempotent rather than a request that spends something.
async function ensureUpstream(lazy: LazyBrowser): Promise<string> {
  if (lazy.session.closed) throw new Error('e2e browser is no longer available');
  noteFailure(lazy);
  // Past the budget this tab is not given a browser again, and saying so is the last thing said about
  // it: the guard keeps listening, so a tab the user can still read and close is a tab the user can
  // still read and close.
  if (lazy.failures >= RESTART_LIMIT) {
    if (!lazy.reported) {
      lazy.reported = true;
      lazy.session.onGone(WILL_NOT_RESTART, undefined);
    }
    throw new Error(WILL_NOT_RESTART);
  }
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
  // Recorded before anything is acquired rather than once the child is listening, for two reasons: a
  // tab that closes during a launch closes this child like any other, and a start that failed is a
  // generation the next connect can find and count rather than a launch that left nothing to judge.
  lazy.spawnedAt = Date.now();
  lazy.generation = generation;
  try {
    generation.scratch = allocateBrowserScratch(lazy.label);
    generation.child = spawnBrowserChild(generation, lazy.ports.browserPort, lazy.internalPath);
    await waitForListening(generation, lazy.ports.browserPort);
  } catch (error) {
    stopSession(generation, `e2e browser failed to start: ${errorText(error)}`);
    throw error;
  }
  return upstreamOf(lazy);
}
