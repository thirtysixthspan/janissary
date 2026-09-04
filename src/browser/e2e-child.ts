import path from 'node:path';
import { chromium } from 'playwright';

// The `janus e2e-browser` subcommand: the browser server itself, run as its own process so
// `sandboxSpawn` can confine it. `launchServer()` runs inside whatever process calls it, and the
// janissary server must not be confined, so this cannot live in-process — the child is the whole
// reason the confinement comes from the existing Seatbelt machinery rather than a hand-rolled
// `sandbox-exec` wrapper. Chromium's helper processes are children of this one, so they inherit the
// profile the way any child does, and killing this process takes them with it.

export type E2EChildArgs = { port: number; wsPath: string; dir: string };

// `--port <n> --ws-path <token> --dir <path>`, parsed by hand rather than through `parseArgs`: this
// is spawned only by `startE2EBrowserServer`, never typed by a user, so the useful failure is a
// clear throw on a malformed invocation rather than a usage string.
export function parseE2EBrowserArgs(argv: string[]): E2EChildArgs | { error: string } {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const rawPort = value('--port');
  const port = Number(rawPort);
  if (!rawPort || !Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    return { error: `e2e-browser: invalid --port value: ${String(rawPort)}` };
  }
  const wsPath = value('--ws-path');
  const dir = value('--dir');
  if (!wsPath || !dir) return { error: 'e2e-browser: --ws-path and --dir are required' };
  return { port, wsPath, dir };
}

/**
 * Launch the browser server and stay up until killed. Headless always — the AI never needs to look
 * at a window — and from Playwright's own bundled Chromium with no `channel`, unlike the `browser`
 * command: the profile has to carve in the exact app bundle, so janissary needs the path it is
 * launching, which `executablePath()` gives it and a channel selection does not.
 *
 * Everything Chromium persists lands inside `dir`, which is what the browser profile's `WORKSPACE`
 * parameter names: downloads go to `dir` explicitly, and the browser profile lands in `dir`'s temp
 * sibling because the caller points `TMPDIR` there and Playwright creates its own profile directory
 * under `os.tmpdir()`. The user data directory is deliberately NOT passed as a Chromium argument —
 * Playwright owns that flag and rejects an invocation that supplies its own.
 *
 * The directory is created empty by the caller and is never a git clone, so a `file://` read that
 * got past the protocol guard finds nothing worth having.
 */
export async function runE2EBrowser(args: E2EChildArgs): Promise<void> {
  const server = await chromium.launchServer({
    port: args.port,
    wsPath: args.wsPath,
    headless: true,
    executablePath: chromium.executablePath(),
    downloadsPath: path.join(args.dir, 'downloads'),
  });
  // Exit as soon as the browser is gone rather than lingering as a process with nothing behind it:
  // the parent watches this process's exit to decide the browser has died and to notify the user.
  server.on('close', () => process.exit(0));
}
