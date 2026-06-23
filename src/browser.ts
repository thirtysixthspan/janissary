import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';
// playwright-extra wraps Playwright's chromium so plugins can patch the browser. The
// stealth plugin masks the most common headless-automation tells (navigator.webdriver,
// missing window.chrome, permissions/plugins/WebGL inconsistencies, userAgentData, …).
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { randomBrowserProfile, acceptLanguage, DEFAULT_CHROME_MAJOR } from './user-agent.js';

// Register the stealth plugin once for the process. `chromium.use` is idempotent per
// plugin name, so importing this module more than once is safe.
chromium.use(StealthPlugin());

// Pull the major version out of a Playwright version string like "149.0.7827.55" so the
// generated UA claims the same Chrome version the engine actually reports via client hints.
function chromeMajor(version: string): number {
  const major = parseInt(version.split('.')[0], 10);
  return Number.isFinite(major) ? major : DEFAULT_CHROME_MAJOR;
}

// A headless/headed browser is owned per janissary tab: each tab launches its own
// Playwright process (so modes can differ between tabs) and holds one or more isolated
// windows. A "window" is a BrowserContext (its own cookies/storage) plus a single Page —
// the viewport. The Browser handle stays private to the TabBrowser; callers only ever see
// the BrowserWindow surface and the TabBrowser lifecycle methods.

export type BrowserWindow = {
  id: string;
  // Navigate to a URL (waits for load); returns a short "title — url" summary.
  goto: (url: string) => Promise<string>;
  // Run JavaScript in the page and return the (JSON-stringified) result.
  eval: (js: string) => Promise<string>;
  // Screenshot the viewport to a temp PNG and (on macOS) open it in Preview; returns the path.
  shot: () => Promise<string>;
  // The page's rendered text (title + body innerText), truncated for agent consumption.
  content: () => Promise<string>;
  // Current page URL, for `connection list` display.
  url: () => string;
};

export type TabBrowser = {
  mode: 'headless' | 'headed';
  openWindow: (id: string) => Promise<BrowserWindow>;
  window: (id: string) => BrowserWindow | undefined;
  closeWindow: (id: string) => Promise<void>;
  windowIds: () => string[];
  close: () => Promise<void>;
};

// Cap on `content()` output so a large page does not blow up the prompt fed back to an
// ACP agent. Truncation is flagged in the returned text.
const CONTENT_LIMIT = 10000;

function makeWindow(id: string, page: Page): BrowserWindow {
  return {
    id,
    goto: async (url) => {
      await page.goto(url, { waitUntil: 'load' });
      const title = await page.title();
      return `${title || '(untitled)'} — ${page.url()}`;
    },
    eval: async (js) => {
      const result = await page.evaluate(js);
      return result === undefined ? 'undefined' : JSON.stringify(result, null, 2);
    },
    shot: async () => {
      const dir = mkdtempSync(join(tmpdir(), 'janissary-'));
      const path = join(dir, `${id}-${Date.now()}.png`);
      await page.screenshot({ path });
      if (process.platform === 'darwin') {
        // Open the screenshot detached so it never blocks the Ink render loop.
        const child = spawn('open', ['-a', 'Preview', path], { stdio: 'ignore', detached: true });
        child.on('error', () => {});
        child.unref();
      }
      return path;
    },
    content: async () => {
      const title = await page.title();
      const body = await page.evaluate(() => document.body?.innerText ?? '');
      const text = `${title}\n\n${body}`.trim();
      return text.length > CONTENT_LIMIT
        ? `${text.slice(0, CONTENT_LIMIT)}\n… (truncated, ${text.length - CONTENT_LIMIT} more chars)`
        : text;
    },
    url: () => page.url(),
  };
}

/**
 * Launch a tab's browser. The mode is fixed for the lifetime of the returned TabBrowser's
 * Playwright process; to switch modes, close all windows (which ends the process) and
 * launch again.
 */
export async function launchTabBrowser(headless: boolean): Promise<TabBrowser> {
  // `channel: 'chromium'` selects Chromium's new headless mode (a real browser run
  // headless) rather than the legacy headless shell, which is far more detectable.
  // `--disable-blink-features=AutomationControlled` drops the automation flag that sets
  // navigator.webdriver and the "Chrome is being controlled by automated test software"
  // banner.
  const browser: Browser = await chromium.launch({
    channel: 'chromium',
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const major = chromeMajor(browser.version());
  const windows = new Map<string, { window: BrowserWindow; context: BrowserContext }>();

  return {
    mode: headless ? 'headless' : 'headed',
    openWindow: async (id) => {
      // A fresh, internally consistent fingerprint per window so isolated windows don't
      // share an identical signature: UA (version pinned to the real engine), matching
      // client-hint platform header, Accept-Language, timezone, and a common viewport.
      const profile = randomBrowserProfile(major);
      const context = await browser.newContext({
        userAgent: profile.userAgent,
        locale: profile.locale,
        timezoneId: profile.timezoneId,
        viewport: profile.viewport,
        extraHTTPHeaders: {
          'Accept-Language': acceptLanguage(profile.locale),
          'Sec-CH-UA-Platform': `"${profile.platform}"`,
        },
      });
      // Belt-and-suspenders alongside the stealth plugin: ensure navigator.webdriver is
      // never true in any frame of this context.
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });
      const page = await context.newPage();
      const window = makeWindow(id, page);
      windows.set(id, { window, context });
      return window;
    },
    closeWindow: async (id) => {
      const entry = windows.get(id);
      if (!entry) return;
      windows.delete(id);
      try {
        await entry.context.close();
      } catch {
        /* already gone */
      }
    },
    window: (id) => windows.get(id)?.window,
    windowIds: () => [...windows.keys()],
    close: async () => {
      windows.clear();
      try {
        await browser.close();
      } catch {
        /* already gone */
      }
    },
  };
}
