import { writeSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { endedCleanly, withEndDetail } from './e2e-exit.js';
import { E2E_LOOPBACK_HOST } from './e2e-loopback.js';

// The `janus e2e-browser` subcommand: the browser server itself, run as its own process so
// `sandboxSpawn` can confine it. `launchServer()` runs inside whatever process calls it, and the
// janissary server must not be confined, so this cannot live in-process — the child is the whole
// reason the confinement comes from the existing Seatbelt machinery rather than a hand-rolled
// `sandbox-exec` wrapper. Chromium's helper processes are children of this one, so they inherit the
// profile the way any child does, and killing this process takes them with it.

export type E2EChildArgs = { port: number; wsPath: string; dir: string };

// The variable carrying the browser server's secret path. It is *not* an argument, and that is the
// point: on macOS a process's argument vector is readable through `ps` by any user on the machine,
// so a token on the command line is published to every account on the host for as long as the tab is
// open — and holding it, with the port, is a complete bypass of the protocol guard.
//
// This narrows who can reach that disclosure; it does not make the path private. The same user can
// still read another process's environment, and Playwright's own server serves this very path from
// an unauthenticated `GET /json` to anything that can reach the port. What closed the route rather
// than narrowing it is the Seatbelt deny on the whole browser port band, so a confined harness
// cannot reach any browser's port to ask — which is a kernel boundary and therefore does nothing on
// a host without one. See `product/plans/complete/browser-private-transport-boundary.md` and
// `product/plans/complete/browser-port-band-denied-to-every-harness.md`.
export const WS_PATH_ENV = 'JANISSARY_E2E_WS_PATH';

// What `DEBUG` is set to in this child's environment, which is how Chromium's own output reaches
// anyone. `launchServer` spawns Chromium with pipes of Playwright's own and reads both streams into
// this namespace's logger. A launch that fails carries those lines out in its error, and that is the
// only route out of Playwright there is: `BrowserServer` exposes nothing, so a browser that came up
// and died later took every line it had printed with it. Enabled, `debug` writes them to this
// process's stderr as they arrive, which the parent is already reading (see `e2e-server.ts`).
//
// Exactly this namespace and no wider one. `pw:protocol` carries every CDP message — the content of
// every page and everything typed into one among them — and this output ends up in a file under the
// project directory. `pw:*` would turn it on.
export const BROWSER_LOG_NAMESPACE = 'pw:browser';

// `--port <n> --dir <path>` plus `JANISSARY_E2E_WS_PATH`, parsed by hand rather than through
// `parseArgs`: this is spawned only by `startE2EBrowserServer`, never typed by a user, so the useful
// failure is a clear throw on a malformed invocation rather than a usage string. The port and the
// directory stay on the command line — neither is a credential, and the port is discoverable by
// scanning whatever we do with it.
export function parseE2EBrowserArgs(argv: string[], env: NodeJS.ProcessEnv): E2EChildArgs | { error: string } {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const rawPort = value('--port');
  const port = Number(rawPort);
  if (!rawPort || !Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    return { error: `e2e-browser: invalid --port value: ${String(rawPort)}` };
  }
  const wsPath = env[WS_PATH_ENV];
  if (!wsPath) return { error: `e2e-browser: ${WS_PATH_ENV} is required` };
  const dir = value('--dir');
  if (!dir) return { error: 'e2e-browser: --dir is required' };
  return { port, wsPath, dir };
}

/**
 * Launch the browser server and stay up until killed. Headless always — the AI never needs to look
 * at a window — and from Playwright's own bundled Chromium with no `channel`, unlike the `browser`
 * command: the profile has to carve in the exact app bundle, so janissary needs the path it is
 * launching, which `executablePath()` gives it and a channel selection does not.
 *
 * Everything Chromium persists lands inside `dir`, which is what the browser profile's `WORKSPACE`
 * parameter names: downloads go to `dir` explicitly, and the browser profile and Chromium's own temp
 * directories (the ProcessSingleton socket directory among them) land in `dir`'s temp sibling
 * because the caller points both `TMPDIR` and `MAC_CHROMIUM_TMPDIR` there — Playwright creates its
 * own profile directory under `os.tmpdir()`, while Chromium's macOS temp resolution ignores `TMPDIR`
 * and reads the second variable instead. The user data directory is deliberately NOT passed as a
 * Chromium argument — Playwright owns that flag and rejects an invocation that supplies its own.
 *
 * The directory is created empty by the caller and is never a git clone, so a `file://` read that
 * got past the protocol guard finds nothing worth having.
 *
 * `host` is passed explicitly rather than left at Playwright's `localhost` default: the guard on the
 * other end of this hop dials an address, not a name, and a host whose resolver answers `localhost`
 * with `::1` first would otherwise leave the two halves listening and dialling on different families
 * (see `e2e-loopback.ts`). Still loopback only — now on one family rather than whichever the
 * resolver happens to pick.
 */
export async function runE2EBrowser(args: E2EChildArgs): Promise<void> {
  const server = await chromium.launchServer({
    port: args.port,
    host: E2E_LOOPBACK_HOST,
    wsPath: args.wsPath,
    headless: true,
    executablePath: chromium.executablePath(),
    downloadsPath: path.join(args.dir, 'downloads'),
  });
  // Exit as soon as the browser is gone rather than lingering as a process with nothing behind it:
  // the parent watches this process's exit to decide the browser has died and to notify the user.
  // What it exits *with* is the only account anyone gets of why the browser went, so it reports
  // Chromium's own status both ways — as a line the parent reads off this process's stderr, and as
  // the exit code the parent's own `exit` handler is passed.
  const browser = server.process();
  server.on('close', () => reportBrowserEnd(browser));
}

/**
 * Say how Chromium ended and exit accordingly. Called only from the close handler, where the browser
 * process has already gone and its status is therefore final.
 *
 * `writeSync` on fd 2 rather than `process.stderr.write`, because a write to a pipe is asynchronous
 * on macOS: the bytes would still be queued when `process.exit` took the process down, and this line
 * is the entire point of the path. The blocking write puts them in the pipe the parent is reading
 * before anything else happens.
 *
 * Exiting zero only for a clean Chromium exit, where the previous unconditional `exit(0)` said every
 * death was a graceful shutdown. The parent notifies either way; the code is what tells it which.
 */
function reportBrowserEnd(browser: { exitCode: number | null; signalCode: NodeJS.Signals | null }): void {
  const end = { code: browser.exitCode, signal: browser.signalCode };
  writeSync(2, `${withEndDetail('chromium exited', end)}\n`);
  process.exit(endedCleanly(end) ? 0 : 1);
}
