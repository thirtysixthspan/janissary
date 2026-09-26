import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadFrameEnablerExtension } from './chrome-extension-loader.js';
import { resizeAppWindow, getAppWindowBounds } from './cdp-window-resize.js';
import { CdpPipe } from './cdp-pipe.js';
import { setWindowResizer, setWindowBoundsReader } from './window-resizer.js';
import type { ChildProcess } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

// The Chrome app window, and the CDP pipe into it. Both live here rather than in the boot sequence
// so the launch and the teardown that has to follow it — a quit, an exit, Ctrl+C — are one concern
// with one owner.

// The Chrome "app" window we launched, so we can close it on shutdown (quit/exit/Ctrl+C).
let appChild: ChildProcess | undefined;
let appCdp: CdpPipe | undefined;

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
export function openApp(url: string, projectDir: string): void {
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
    const cdp = new CdpPipe(writePipe, readPipe);
    appCdp = cdp;
    void loadFrameEnablerExtension(cdp, extDir);
    setWindowResizer((width, height) => resizeAppWindow(cdp, width, height));
    setWindowBoundsReader(() => getAppWindowBounds(cdp));
  } else {
    process.stderr.write(
      'warning: Chrome frame-enabler extension failed to load (fd 3/4 pipes unavailable) — sites that block iframing may not render in page tabs\n',
    );
  }
}

// Take the window down with its renderers and unhook the resizers, so nothing is left holding the
// CDP pipe. Safe with no window open, which is the ordinary case for a server started with
// `--no-open`.
export function closeApp(): void {
  appCdp?.dispose();
  appCdp = undefined;
  setWindowResizer(undefined);
  setWindowBoundsReader(undefined);
  if (appChild?.pid) {
    // Chrome is spawned detached (its own process group), so kill the group to take down its
    // renderers too. Fall back to a direct kill (e.g. on Windows where group kill isn't available).
    try { process.kill(-appChild.pid, 'SIGTERM'); }
    catch { try { appChild.kill(); } catch { /* already gone */ } }
    appChild = undefined;
  }
}
