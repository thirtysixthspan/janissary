import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './index.js';
import { makeToken } from './security.js';
import { initAgentStateDir, clearStateDir } from '../agent-state.js';
import { initDbDir } from '../connections.js';
import { initProfileDir } from '../profiles.js';
import { loadConfig } from '../config.js';

// Fallback: open a URL in the default browser.
function openUrl(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch { /* ignore */ }
}

// Resolve a `which <bin>` to an absolute path (POSIX), or null.
function which(bin: string): string | null {
  try {
    const r = spawnSync('which', [bin], { encoding: 'utf8' });
    const out = (r.stdout || '').trim().split('\n')[0];
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
    const rels = ['Google\\Chrome\\Application\\chrome.exe', 'Microsoft\\Edge\\Application\\msedge.exe'];
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
}

export async function boot(argv = process.argv.slice(2)): Promise<void> {
  const relaunch = argv.includes('--relaunch');
  const noOpen = argv.includes('--no-open');
  const portArg = argv.find((a) => a.startsWith('--port='));
  const port = portArg ? Number(portArg.slice('--port='.length)) : undefined;

  const cwd = process.cwd();
  initAgentStateDir(cwd);
  initDbDir(cwd);
  initProfileDir(cwd);
  loadConfig(cwd);
  if (!relaunch) clearStateDir();

  const webDir = join(import.meta.dirname, '..', '..', 'web', 'dist');
  const server = await startServer({ webDir, token: makeToken(), port, relaunch });

  // Machine-readable line first (the launcher may parse it), then a human line.
  process.stdout.write(`__JANUS_URL__ ${server.url}\n`);
  process.stderr.write(`\nJanissary is running at:\n  ${server.url}\n\nPress Ctrl+C to stop.\n`);
  if (!noOpen) openApp(server.url, cwd);

  const stop = () => { void server.close().then(() => process.exit(0)); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

// Run when executed directly (node dist/server/main.js or tsx src/server/main.ts).
boot().catch((e) => {
  process.stderr.write(`Failed to start Janissary: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
