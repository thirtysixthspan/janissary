import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { makeToken } from '../security.js';
import { sandboxSpawn } from '../sandbox/index.js';
import { workspacePath, workspaceTempPath, removeWorkspace, ensureWorkspaceDir } from '../workspace/index.js';
import { startE2EGuard, type E2EGuardHandle } from './e2e-guard.js';
import { chromiumBundleDir, playwrightPackagePaths } from './playwright-paths.js';

// Lifecycle orchestration for one harness tab's e2e browser: the guard, the confined child behind
// it, and the scratch workspace the child lives in. Lives in `src/browser/` because it is browser
// machinery and because both the local harness manager and the remote server import it. It holds no
// label-keyed state — the caller owns the handle it returns and disposes it (see `HarnessRuntime`).

export type E2EBrowserHandle = {
  // Idempotent, and safe before the child has finished starting. Stops the guard, kills the child,
  // and removes the browser workspace and its temp sibling.
  close: () => void;
};

export type E2EBrowserServer = {
  // `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT`, merged into the harness's spawn
  // environment by the caller.
  env: NodeJS.ProcessEnv;
  handle: E2EBrowserHandle;
};

export type E2EBrowserOptions = {
  // The tab's label; the browser workspace is `<label>.browser` beside it.
  label: string;
  // Invoked once when the browser is gone for a reason the user did not ask for: a child that
  // exits, a child that never starts, or a guard that cannot listen. Never invoked after `close()`.
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
 */
export function startE2EBrowserServer(options: E2EBrowserOptions): E2EBrowserServer {
  const guardPort = pickPort();
  const browserPort = pickPort();
  // Two unguessable paths, not one: the agent is given the first and the second never leaves this
  // process, so holding the published endpoint does not reveal a route around the guard.
  const publishedPath = `/${makeToken()}`;
  const internalPath = `/${makeToken()}`;

  const dir = browserWorkspace(options.label);
  const state = { closed: false, fired: false };
  const gone = (message: string): void => {
    if (state.closed || state.fired) return;
    state.fired = true;
    options.onGone(message);
  };

  const guard = startE2EGuard({
    port: guardPort, wsPath: publishedPath,
    upstreamPort: browserPort, upstreamPath: internalPath,
    onError: gone,
  });
  const child = spawnBrowserChild(dir, browserPort, internalPath, gone);

  return {
    env: {
      JANISSARY_BROWSER_WS_ENDPOINT: `ws://127.0.0.1:${guardPort}${publishedPath}`,
      JANISSARY_PLAYWRIGHT: playwrightPackagePaths().entry,
    },
    handle: closeHandle(state, guard, child, dir),
  };
}

// A fresh, empty directory of the browser's own beside the harness workspaces — never a git clone.
// The browser has no reason to read the code under test, and giving it none means a `file://` read
// that gets past the guard sees an empty scratch directory. It also means `-b` works with
// `--no-workspace`, where the tab has no workspace to share.
function browserWorkspace(label: string): string {
  ensureWorkspaceDir();
  const dir = workspacePath(`${label}.browser`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(workspaceTempPath(`${label}.browser`), { recursive: true });
  return dir;
}

// Spawn `janus e2e-browser` through `sandboxSpawn`, which wraps it in the minimal browser profile
// (see `src/sandbox/browser-profile.ts`) on a host that can confine it and hands the command back
// unchanged on one that cannot. `TMPDIR` is set either way, so Playwright's own profile directory
// lands inside the browser's temp sibling rather than in shared `/tmp` even unconfined.
function spawnBrowserChild(
  dir: string, port: number, wsPath: string, gone: (message: string) => void,
): ChildProcess | undefined {
  const entry = path.join(import.meta.dirname, '..', 'main.js');
  const args = ['e2e-browser', '--port', String(port), '--ws-path', wsPath, '--dir', dir];
  // Janissary's installation root, two levels up from `src/browser/` — the profile carves it in so
  // the child can read the entry point above and the dependencies it pulls in.
  const appDir = path.join(import.meta.dirname, '..', '..');
  const wrapped = sandboxSpawn(
    { workspaceDir: dir, browser: { chromiumDir: chromiumBundleDir(), appDir } },
    process.execPath, [entry, ...args],
  );
  const env = { ...wrapped.env, TMPDIR: `${dir}.tmp` };
  try {
    const child = spawn(wrapped.command, wrapped.args, { stdio: 'ignore', env });
    child.on('error', (error) => gone(`e2e browser failed to start: ${error.message}`));
    child.on('exit', () => gone('e2e browser exited'));
    return child;
  } catch (error) {
    gone(`e2e browser failed to start: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function closeHandle(
  state: { closed: boolean }, guard: E2EGuardHandle, child: ChildProcess | undefined, dir: string,
): E2EBrowserHandle {
  return {
    close: () => {
      if (state.closed) return;
      state.closed = true;
      guard.close();
      try { child?.kill(); } catch { /* already gone */ }
      removeWorkspace(dir);
    },
  };
}
