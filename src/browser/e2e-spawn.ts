import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { sandboxSpawn } from '../sandbox/index.js';
import { WS_PATH_ENV } from './e2e-child.js';
import { resolveChildLaunch } from './e2e-child-command.js';
import { withEndDetail } from './e2e-exit.js';
import { stopSession, type E2ESession } from './e2e-session.js';
import { chromiumBundleDir, playwrightPackagePaths } from './playwright-paths.js';

// The one confined Chromium, spawned for a session. Split out of `e2e-server.ts` because this is
// where a browser's containment is decided — the profile, the workspace, the two temp variables, and
// the reporting of whatever the child says — and the one start sequence in that file needs all of it
// without owning it.

/**
 * Spawn `janus e2e-browser` through `sandboxSpawn`, which wraps it in the minimal browser profile
 * (see `src/sandbox/browser-profile.ts`) on a host that can confine it and hands the command back
 * unchanged on one that cannot. `TMPDIR` and `MAC_CHROMIUM_TMPDIR` are set either way, so
 * Playwright's own profile directory and Chromium's own temp directories both land inside the
 * browser's temp sibling rather than in shared `/tmp` even unconfined.
 */
export function spawnBrowserChild(session: E2ESession, port: number, wsPath: string): ChildProcess {
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
