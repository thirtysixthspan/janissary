import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT_FILE_POLL_INTERVAL_MS = 100;
const PORT_FILE_POLL_CEILING_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// Chrome writes `DevToolsActivePort` into the profile dir shortly (not immediately) after
// startup when launched with `--remote-debugging-port=0`. First line is the port number.
async function readDevToolsPort(profileDir: string): Promise<number> {
  const portFile = path.join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + PORT_FILE_POLL_CEILING_MS;
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const firstLine = readFileSync(portFile, 'utf8').split('\n', 1)[0] ?? '';
      const port = Number(firstLine);
      if (Number.isFinite(port) && port > 0) return port;
    }
    await sleep(PORT_FILE_POLL_INTERVAL_MS);
  }
  throw new Error(`DevToolsActivePort did not appear within ${PORT_FILE_POLL_CEILING_MS}ms`);
}

// Loads the bundled Frame Enabler extension into an already-launched, branded Chrome via CDP
// (`Extensions.loadUnpacked`) — the sanctioned replacement for the `--load-extension` launch flag
// Google removed from branded Chrome 137+. Never throws: any failure is reported as a single
// stderr warning, since page-tab framing is a nice-to-have, not core functionality.
export async function loadFrameEnablerExtension(profileDir: string, extDir: string): Promise<void> {
  try {
    const port = await readDevToolsPort(profileDir);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    try {
      const session = await browser.newBrowserCDPSession();
      // The `Extensions` CDP domain postdates Playwright's bundled protocol types, so
      // `session.send` (typed over the known domains) needs an explicit cast here.
      await (session.send as (method: string, params?: unknown) => Promise<unknown>)(
        'Extensions.loadUnpacked',
        { path: extDir },
      );
    } finally {
      await browser.close();
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `warning: Chrome frame-enabler extension failed to load (${reason}) — sites that block iframing may not render in page tabs\n`,
    );
  }
}
