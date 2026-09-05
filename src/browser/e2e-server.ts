import { spawn, type ChildProcess } from 'node:child_process';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { errorText } from '../error-text.js';
import { makeToken } from '../security.js';
import { sandboxSpawn } from '../sandbox/index.js';
import { resolveChildLaunch } from './e2e-child-command.js';
import { startE2EGuard } from './e2e-guard.js';
import { loopbackWsUrl } from './e2e-loopback.js';
import { allocateBrowserScratch } from './e2e-scratch.js';
import { newSession, stopSession, type E2ESession } from './e2e-session.js';
import { chromiumBundleDir, playwrightPackagePaths } from './playwright-paths.js';

// Lifecycle orchestration for one harness tab's e2e browser: the guard, the confined child behind
// it, and the scratch workspace the child lives in. Lives in `src/browser/` because it is browser
// machinery and because both the local harness manager and the remote server import it. It holds no
// label-keyed state — the caller owns the handle it returns and disposes it (see `HarnessRuntime`).

export type E2EBrowserHandle = {
  // Idempotent, and safe before the child has finished starting. Stops the guard, kills the child,
  // and removes the browser workspace and its temp sibling. A browser that already ended on its own
  // has released all of that at that moment, so this is then a no-op.
  close: () => void;
};

export type E2EBrowserServer = {
  // `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT`, merged into the harness's spawn
  // environment by the caller.
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
  onGone: (message: string) => void;
};

// The dynamic/private port range. Two ports are drawn from it: the guard's, which the agent's
// endpoint names, and the browser server's own, which never leaves this process.
//
// There is no way to reserve a TCP port synchronously in Node — every bind is asynchronous — and the
// endpoint has to be known synchronously so the PTY spawn is never gated on the browser starting
// (which is what keeps this feature out of the codebase's async provisioning machinery: no
// placeholder tab, no promise that must never reject). So the ports are drawn rather than probed,
// and losing one to another process is not silent: the guard or the child fails to listen, `onGone`
// fires, and the user gets a notification.
function pickPort(): number {
  return randomInt(49_152, 65_536);
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
  const guardPort = pickPort();
  const browserPort = pickPort();
  // Two unguessable paths, not one: the agent is given the first and the second never leaves this
  // process, so holding the published endpoint does not reveal a route around the guard.
  const publishedPath = `/${makeToken()}`;
  const internalPath = `/${makeToken()}`;

  const session = newSession(options.onGone);
  try {
    session.scratch = allocateBrowserScratch(options.label);
    session.guard = startE2EGuard({
      port: guardPort, wsPath: publishedPath,
      upstreamPort: browserPort, upstreamPath: internalPath,
      onError: (message) => stopSession(session, message),
    });
    session.child = spawnBrowserChild(session, browserPort, internalPath);
  } catch (error) {
    stopSession(session, `e2e browser failed to start: ${errorText(error)}`);
  }

  return {
    env: {
      JANISSARY_BROWSER_WS_ENDPOINT: loopbackWsUrl(guardPort, publishedPath),
      JANISSARY_PLAYWRIGHT: playwrightPackagePaths().entry,
    },
    handle: { close: () => stopSession(session) },
  };
}

// Spawn `janus e2e-browser` through `sandboxSpawn`, which wraps it in the minimal browser profile
// (see `src/sandbox/browser-profile.ts`) on a host that can confine it and hands the command back
// unchanged on one that cannot. `TMPDIR` is set either way, so Playwright's own profile directory
// lands inside the browser's temp sibling rather than in shared `/tmp` even unconfined.
function spawnBrowserChild(session: E2ESession, port: number, wsPath: string): ChildProcess {
  const scratch = session.scratch;
  if (!scratch) throw new Error('no scratch directory was allocated');
  // The entry and the interpreter both come from whichever tree this process is running (see
  // `e2e-child-command.ts`); a source run cannot reach `main.js` beside `src/`.
  const launch = resolveChildLaunch({
    moduleFile: import.meta.filename, execPath: process.execPath, execArgv: process.execArgv,
  });
  const args = ['e2e-browser', '--port', String(port), '--ws-path', wsPath, '--dir', scratch.dir];
  // Janissary's installation root, two levels up from `src/browser/` — the profile carves it in so
  // the child can read the entry point above and the dependencies it pulls in, the loader among
  // them.
  const appDir = path.join(import.meta.dirname, '..', '..');
  const wrapped = sandboxSpawn(
    { workspaceDir: scratch.dir, browser: { chromiumDir: chromiumBundleDir(), appDir } },
    launch.command, [...launch.args, ...args],
  );
  const env = { ...wrapped.env, TMPDIR: scratch.tempDir };
  // A throw here is caught by the caller's rollback, which produces the same message these handlers
  // do — so there is no second `catch` and no second wording for the same failure.
  const child = spawn(wrapped.command, wrapped.args, { stdio: 'ignore', env });
  child.on('error', (error) => stopSession(session, `e2e browser failed to start: ${error.message}`));
  child.on('exit', () => stopSession(session, 'e2e browser exited'));
  return child;
}
