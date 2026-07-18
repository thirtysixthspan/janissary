import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { startServer } from './index.js';
import { makeToken } from './security.js';
import { initAgentStateDirectory, clearStateDirectory } from './agent/state.js';
import { initHarnessCaptureDirectory, clearCaptureDirectory } from './harness/capture-file.js';
import { initHarnessRecordingDirectory, clearHarnessRecordingDirectory } from './harness/recording-file.js';
import { acquireLock, releaseLock } from './instance-lock.js';
import { stopInstance } from './stop-instance.js';
import { initGlobalHistory } from './global-history.js';
import { TranscriptLogger } from './transcript/logger.js';
import { TranscriptStore } from './transcript/store.js';
import { initDbDir } from './connections.js';
import { initProfileDir } from './profiles.js';
import { initWorkspaceDir, clearWorkspaceDir } from './workspace.js';
import { loadConfig } from './config.js';
import { loadAgentNames } from './agent-names.js';
import { loadHarnessModels } from './harness/models.js';
import { loadGithubToken } from './github-token.js';
import { parseCliArgs, usageText, appVersion, CliUsageError } from './cli-args.js';
import { explainStartupError, formatFatal, maybeStack } from './startup-errors.js';
import { loadFrameEnablerExtension } from './chrome-extension-loader.js';
import type { ChildProcess } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

// The Chrome "app" window we launched, so we can close it on shutdown (quit/exit/Ctrl+C).
let appChild: ChildProcess | undefined;

// Set once the target directory is resolved in boot(), so the exit handler can release its lock.
let lockedDir: string | undefined;

// Set once args are parsed in boot(), so the top-level catch can include the attempted port
// in startup-error messages even though the catch itself sits outside boot()'s scope.
let parsedPort: number | undefined;

function killApp(): void {
  if (appChild?.pid) {
    // Chrome is spawned detached (its own process group), so kill the group to take down its
    // renderers too. Fall back to a direct kill (e.g. on Windows where group kill isn't available).
    try { process.kill(-appChild.pid, 'SIGTERM'); }
    catch { try { appChild.kill(); } catch { /* already gone */ } }
    appChild = undefined;
  }
  if (lockedDir) { releaseLock(lockedDir); lockedDir = undefined; }
}

// Fallback: open a URL in the default browser.
function openUrl(url: string): void {
  const command = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const arguments_ = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try { spawn(command, arguments_, { stdio: 'ignore', detached: true }).unref(); } catch { /* ignore */ }
}

// Resolve a `which <bin>` to an absolute path (POSIX), or null.
function which(bin: string): string | null {
  try {
    const r = spawnSync('which', [bin], { encoding: 'utf8' });
    const out = (r.stdout || '').trim().split('\n', 1)[0];
    return r.status === 0 && out ? out : null;
  } catch {
    return null;
  }
}

// Locate the user's installed Chrome/Chromium ("chrome proper") so the app launches in their real
// browser rather than Playwright's "Chrome for Testing" build. Prefers Google Chrome, then common
// Chromium-family browsers. Returns null when none is found.
function findSystemChrome(): string | null {
  if (process.platform === 'darwin') {
    const apps = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ];
    return apps.find((p) => existsSync(p)) ?? null;
  }
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean) as string[];
    const rels = [String.raw`Google\Chrome\Application\chrome.exe`, String.raw`Microsoft\Edge\Application\msedge.exe`];
    for (const root of roots) for (const rel of rels) { const p = path.join(root, rel); if (existsSync(p)) return p; }
    return null;
  }
  for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser']) {
    const p = which(bin);
    if (p) return p;
  }
  return null;
}

// Open the app in a frameless headed Chrome "app" window (no tabs/omnibox/nav bar) using the
// user's installed system Chrome/Chromium. Uses a dedicated profile under `.janissary/chrome` so
// it launches a clean, independent instance (and keeps logins across launches). Falls back to the
// default browser if no system Chrome is found. The bundled declarativeNetRequest extension strips
// X-Frame-Options / CSP frame-ancestors from sub-frame responses so all sites render in page tabs.
function openApp(url: string, projectDir: string): void {
  const exe = findSystemChrome();
  if (!exe) { openUrl(url); return; }
  const profile = path.join(projectDir, '.janissary', 'chrome');
  mkdirSync(profile, { recursive: true });
  const extDir = path.join(import.meta.dirname, '..', 'chrome-extension');
  // `Extensions.loadUnpacked` is only reachable over the CDP pipe transport (fd 3/4), not
  // `--remote-debugging-port` — hence the extra 'pipe' stdio slots and `--remote-debugging-pipe`.
  // `--load-extension`/`--disable-extensions-except` are deliberately NOT passed: the former is a
  // silent no-op on branded Chrome 137+, but the latter is still enforced and disables everything
  // *except* whatever `--load-extension` actually registered — i.e. nothing — which killed the
  // extension we then loaded dynamically via CDP.
  const child = spawn(exe, [
    `--app=${url}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,800',
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], detached: true });
  child.on('error', () => openUrl(url));
  child.unref();
  appChild = child;
  const writePipe = child.stdio[3] as Writable | null;
  const readPipe = child.stdio[4] as Readable | null;
  if (writePipe && readPipe) {
    void loadFrameEnablerExtension(writePipe, readPipe, extDir);
  } else {
    process.stderr.write(
      'warning: Chrome frame-enabler extension failed to load (fd 3/4 pipes unavailable) — sites that block iframing may not render in page tabs\n',
    );
  }
}

export async function boot(argv = process.argv.slice(2)): Promise<void> {
  const args = parseCliArgs(argv);
  parsedPort = args.port;

  if (args.help) {
    process.stdout.write(usageText());
    return;
  }

  if (args.version) {
    process.stdout.write(`${appVersion()}\n`);
    return;
  }

  const cwd = args.projectDir ?? process.cwd();
  if (args.stop) { stopInstance(cwd); return; }

  acquireLock(cwd);
  lockedDir = cwd;
  initAgentStateDirectory(cwd);
  initHarnessCaptureDirectory(cwd);
  initHarnessRecordingDirectory(cwd);
  initGlobalHistory();
  initDbDir(cwd);
  initProfileDir(cwd);
  initWorkspaceDir(cwd);
  new TranscriptLogger(cwd); // append-only transcript log under .janissary/log/ (never cleared)
  new TranscriptStore(cwd);
  loadConfig(cwd);
  loadAgentNames(cwd);
  loadHarnessModels(cwd);
  loadGithubToken(cwd);
  if (!args.relaunch) { clearStateDirectory(); TranscriptStore.clear(); clearWorkspaceDir(); clearCaptureDirectory(); clearHarnessRecordingDirectory(); }

  const webDir = path.join(import.meta.dirname, '..', 'web', 'dist');
  if (!existsSync(path.join(webDir, 'index.html'))) {
    throw new Error('web UI bundle not found (web/dist).\n  Run `npm run build:web` (or use `npm start`, which builds it first).');
  }
  const server = await startServer({ webDir, token: makeToken(), port: args.port, relaunch: args.relaunch, projectDir: cwd });

  // Machine-readable line first (the launcher may parse it), then a human line.
  process.stdout.write(`__JANUS_URL__ ${server.url}\n`);
  process.stderr.write(`\nJanissary is running at:\n  ${server.url}\n\nPress Ctrl+C to stop.\n`);
  if (!args.noOpen) openApp(server.url, cwd);

  const stop = () => { server.shutdown(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  // Close the app window whenever the process exits (quit/exit, Ctrl+C, or normal shutdown).
  process.on('exit', killApp);
}

// Run when executed directly (node dist/server/main.js or tsx src/server/main.ts).
try {
  await boot();
} catch (error) {
  if (error instanceof CliUsageError) {
    process.stderr.write(`${error.message}\nTry 'janus --help' for more information.\n`);
    process.exit(2);
  }
  const explained = explainStartupError(error, { port: parsedPort });
  const message = explained ?? (error instanceof Error ? error.message : String(error));
  process.stderr.write(`${formatFatal(message)}\n${maybeStack(error)}`);
  process.exit(1);
}
