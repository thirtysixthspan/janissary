import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './index.js';
import { makeToken } from './security.js';
import { initAgentStateDirectory, clearStateDirectory } from './agent-state.js';
import { initDbDir } from './connections.js';
import { initProfileDir } from './profiles.js';
import { initWorkspaceDir, clearWorkspaceDir } from './workspace.js';
import { initLogDir } from './logger.js';
import { loadConfig } from './config.js';
import type { ChildProcess } from 'node:child_process';

// The Chrome "app" window we launched, so we can close it on shutdown (quit/exit/Ctrl+C).
let appChild: ChildProcess | undefined;

function killApp(): void {
  if (!appChild?.pid) return;
  // Chrome is spawned detached (its own process group), so kill the group to take down its
  // renderers too. Fall back to a direct kill (e.g. on Windows where group kill isn't available).
  try { process.kill(-appChild.pid, 'SIGTERM'); }
  catch { try { appChild.kill(); } catch { /* already gone */ } }
  appChild = undefined;
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
    for (const root of roots) for (const rel of rels) { const p = join(root, rel); if (existsSync(p)) return p; }
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
// default browser if no system Chrome is found.
function openApp(url: string, projectDir: string): void {
  const exe = findSystemChrome();
  if (!exe) { openUrl(url); return; }
  const profile = join(projectDir, '.janissary', 'chrome');
  mkdirSync(profile, { recursive: true });
  const child = spawn(exe, [
    `--app=${url}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,800',
  ], { stdio: 'ignore', detached: true });
  child.on('error', () => openUrl(url));
  child.unref();
  appChild = child;
}

export async function boot(argv = process.argv.slice(2)): Promise<void> {
  const isRelaunch = argv.includes('--relaunch');
  const isNoOpen = argv.includes('--no-open');
  const portArgument = argv.find((a) => a.startsWith('--port='));
  const port = portArgument ? Number(portArgument.slice('--port='.length)) : undefined;

  const cwd = process.cwd();
  initAgentStateDirectory(cwd);
  initDbDir(cwd);
  initProfileDir(cwd);
  initWorkspaceDir(cwd);
  initLogDir(cwd); // append-only transcript log under .janissary/log/ (never cleared)
  loadConfig(cwd);
  if (!isRelaunch) { clearStateDirectory(); clearWorkspaceDir(); }

  const webDir = join(import.meta.dirname, '..', 'web', 'dist');
  const server = await startServer({ webDir, token: makeToken(), port, relaunch: isRelaunch });

  // Machine-readable line first (the launcher may parse it), then a human line.
  process.stdout.write(`__JANUS_URL__ ${server.url}\n`);
  process.stderr.write(`\nJanissary is running at:\n  ${server.url}\n\nPress Ctrl+C to stop.\n`);
  if (!isNoOpen) openApp(server.url, cwd);

  const stop = () => { void server.close().then(() => process.exit(0)); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  // Close the app window whenever the process exits (quit/exit, Ctrl+C, or normal shutdown).
  process.on('exit', killApp);
}

// Run when executed directly (node dist/server/main.js or tsx src/server/main.ts).
try {
  await boot();
} catch (error) {
  process.stderr.write(`Failed to start Janissary: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
