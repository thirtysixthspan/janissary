import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { errorText } from '../error-text.js';
import { makeToken } from '../security.js';
import { sandboxSpawn } from '../sandbox/index.js';
import { WS_PATH_ENV } from './e2e-child.js';
import { resolveChildLaunch } from './e2e-child-command.js';
import { withEndDetail } from './e2e-exit.js';
import { startE2EGuard } from './e2e-guard.js';
import { loopbackWsUrl } from './e2e-loopback.js';
import { allocateBrowserPorts } from './e2e-ports.js';
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
  // has released everything but that pair at the moment it ended, so this is then a no-op — the
  // directory it died in is deliberately kept to be read, and the next start sweeps it.
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
  // The one failure that happens before anything is acquired: the browser port band is full, so this
  // host is already running as many browsers as it can. There is no session to tear down and no
  // endpoint to hand back, so the notification goes straight to `onGone` rather than through
  // `stopSession`, and the harness launches with no browser variables at all.
  let ports;
  try {
    ports = allocateBrowserPorts();
  } catch (error) {
    options.onGone(`e2e browser failed to start: ${errorText(error)}`);
    return { env: {}, handle: { close: () => {} } };
  }
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
      upstreamPort: ports.browserPort, upstreamPath: internalPath,
      onError: (message) => stopSession(session, message),
    });
    session.child = spawnBrowserChild(session, ports.browserPort, internalPath);
  } catch (error) {
    stopSession(session, `e2e browser failed to start: ${errorText(error)}`);
  }

  return {
    env: {
      JANISSARY_BROWSER_WS_ENDPOINT: loopbackWsUrl(ports.guardPort, publishedPath),
      JANISSARY_PLAYWRIGHT: playwrightPackagePaths().entry,
    },
    handle: { close: () => stopSession(session) },
  };
}

// Spawn `janus e2e-browser` through `sandboxSpawn`, which wraps it in the minimal browser profile
// (see `src/sandbox/browser-profile.ts`) on a host that can confine it and hands the command back
// unchanged on one that cannot. `TMPDIR` and `MAC_CHROMIUM_TMPDIR` are set either way, so
// Playwright's own profile directory and Chromium's own temp directories both land inside the
// browser's temp sibling rather than in shared `/tmp` even unconfined.
function spawnBrowserChild(session: E2ESession, port: number, wsPath: string): ChildProcess {
  const scratch = session.scratch;
  if (!scratch) throw new Error('no scratch directory was allocated');
  // The entry and the interpreter both come from whichever tree this process is running (see
  // `e2e-child-command.ts`); a source run cannot reach `main.js` beside `src/`.
  const launch = resolveChildLaunch({
    moduleFile: import.meta.filename, execPath: process.execPath, execArgv: process.execArgv,
  });
  // The ws path is deliberately not here: an argument vector is readable through `ps` by any user on
  // a macOS host, and this token plus the port is a complete bypass of the guard. It travels in the
  // child's environment instead (see `WS_PATH_ENV`), which narrows the disclosure without making the
  // path private — that is the deferred transport-boundary work.
  const args = ['e2e-browser', '--port', String(port), '--dir', scratch.dir];
  // Janissary's installation root, two levels up from `src/browser/`, and the tree this process is
  // actually running — `src/` or `dist/`, the same one the entry above came from. The profile takes
  // the runtime pieces it needs from these rather than carving in the root, which in a development
  // install is the project directory.
  const appDir = path.join(import.meta.dirname, '..', '..');
  const appEntryDir = path.dirname(launch.args.at(-1) ?? import.meta.dirname);
  const wrapped = sandboxSpawn(
    {
      workspaceDir: scratch.dir,
      browser: {
        chromiumDir: chromiumBundleDir(), appDir, appEntryDir,
        playwrightDirs: playwrightPackagePaths().dirs,
      },
    },
    launch.command, [...launch.args, ...args],
  );
  // Set here rather than inherited, so the browser environment allowlist does not filter it out.
  // Both temp variables point at the same sibling because Chromium's macOS temp-dir resolution
  // ignores `TMPDIR` entirely: base::GetTempDir() reads `MAC_CHROMIUM_TMPDIR` first and otherwise
  // falls back to NSTemporaryDirectory(), which resolves to the real per-user /var/folders/<hash>/T/
  // the browser profile deliberately denies. Without the second variable Chromium's ProcessSingleton
  // tries to create its socket directory there, is denied, and the browser aborts at startup
  // ("Failed to create socket directory."). With it, everything Chromium builds in its temp dir — the
  // ProcessSingleton socket directory included — lands inside the sibling the profile allows writes
  // to and close() removes.
  const env = {
    ...wrapped.env,
    TMPDIR: scratch.tempDir,
    MAC_CHROMIUM_TMPDIR: scratch.tempDir,
    [WS_PATH_ENV]: wsPath,
  };
  // A throw here is caught by the caller's rollback, which produces the same message these handlers
  // do — so there is no second `catch` and no second wording for the same failure.
  //
  // Piped rather than ignored, so the reason a browser died travels with the news that it did:
  // Playwright's launch error, a `sandbox-exec` profile that would not compile, a port that would
  // not bind. Discarded output made every one of those the same bare "exited". The session reads
  // both streams, which is also what keeps a full pipe from blocking the child.
  const child = spawn(wrapped.command, wrapped.args, {
    cwd: scratch.dir, stdio: ['ignore', 'pipe', 'pipe'], env,
  });
  session.output.watch(child.stdout);
  session.output.watch(child.stderr);
  child.on('error', (error) => stopSession(session, `e2e browser failed to start: ${error.message}`));
  // The code and signal Node passes here are the second half of the account, and the half that
  // survives a child too abrupt to say anything: the child reports Chromium's status on its stderr,
  // this reports the child's own. A child killed by the OS says nothing and still names its signal
  // here. When neither is known the message is the bare `e2e browser exited` it always was.
  child.on('exit', (code, signal) => {
    stopSession(session, withEndDetail('e2e browser exited', { code, signal }));
  });
  return child;
}
