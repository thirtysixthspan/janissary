import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { randomBrowserProfile, acceptLanguage, DEFAULT_CHROME_MAJOR } from '../user-agent.js';
import type { BrowserWindow, TabBrowser } from '../types.js';

// Pull the major version out of a Playwright version string like "149.0.7827.55" so the
// generated UA claims the same Chrome version the engine actually reports via client hints.
function chromeMajor(version: string): number {
  const major = Number(version.split('.', 1)[0]);
  return Number.isFinite(major) ? major : DEFAULT_CHROME_MAJOR;
}

// A headless/headed browser is owned per janissary tab: each tab launches its own
// Playwright process (so modes can differ between tabs) and holds one or more isolated
// windows. A "window" is a BrowserContext (its own cookies/storage) plus a single Page —
// the viewport. The Browser handle stays private to the TabBrowser; callers only ever see
// the BrowserWindow surface and the TabBrowser lifecycle methods.

// Cap on `content()` output so a large page does not blow up the prompt fed back to an
// ACP agent. Truncation is flagged in the returned text.
const CONTENT_LIMIT = 10_000;

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
      return result === undefined ? 'undefined' : JSON.stringify(result, undefined, 2);
    },
    shot: async () => {
      const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'janissary-'));
      const screenshotPath = path.join(temporaryDirectory, `${id}-${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath });
      if (process.platform === 'darwin') {
        // Open the screenshot detached so it never blocks the main process.
        const child = spawn('open', ['-a', 'Preview', screenshotPath], { stdio: 'ignore', detached: true });
        child.on('error', () => {});
        child.unref();
      }
      return screenshotPath;
    },
    content: async () => {
      const title = await page.title();
      const body = await page.evaluate(() => document.body?.textContent ?? ''); // eslint-disable-line unicorn/no-optional-chaining-on-undeclared-variable
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
export async function launchTabBrowser(isHeadless: boolean): Promise<TabBrowser> {
  // `channel: 'chromium'` selects Chromium's new headless mode (a real browser run
  // headless) rather than the legacy headless shell, which is far more detectable.
  // `--disable-blink-features=AutomationControlled` drops the automation flag that sets
  // navigator.webdriver and the "Chrome is being controlled by automated test software"
  // banner.
  const browser: Browser = await chromium.launch({
    channel: 'chromium',
    headless: isHeadless,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const major = chromeMajor(browser.version());
  const windows = new Map<string, { window: BrowserWindow; context: BrowserContext }>();

  return {
    mode: isHeadless ? 'headless' : 'headed',
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
      // Ensure navigator.webdriver is never true in any frame of this context.
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
