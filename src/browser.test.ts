import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'playwright';
import { launchTabBrowser, type TabBrowser } from './browser.js';

// Live browser tests need the chromium binary (installed via postinstall). Skip the whole
// suite when it is unavailable so a binary-less CI run does not fail.
let available: boolean;
try {
  const probe = await chromium.launch({ headless: true });
  await probe.close();
  available = true;
} catch {
  available = false;
}

const PAGE = 'data:text/html,<title>Widgets</title><body><h1>Hello</h1><p>Welcome to widgets.</p></body>';

describe.skipIf(!available)('TabBrowser', () => {
  let browser: TabBrowser;

  beforeAll(async () => {
    browser = await launchTabBrowser(true);
  });

  afterAll(async () => {
    await browser.close();
  });

  it('reports its launch mode', () => {
    expect(browser.mode).toBe('headless');
  });

  it('opens a window, navigates, and exposes it by id', async () => {
    const win = await browser.openWindow('w1');
    const summary = await win.goto(PAGE);
    expect(summary).toContain('Widgets');
    expect(browser.windowIds()).toContain('w1');
    expect(browser.window('w1')).toBe(win);
  });

  it('evaluates JS in the page', async () => {
    const win = browser.window('w1')!;
    expect(await win.eval('document.title')).toBe(JSON.stringify('Widgets'));
  });

  it('overrides the window with a randomized Chrome user agent', async () => {
    const win = browser.window('w1')!;
    const ua = JSON.parse(await win.eval('navigator.userAgent'));
    expect(ua).toMatch(/Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/);
    // Not the default Playwright/HeadlessChrome signature.
    expect(ua).not.toContain('HeadlessChrome');
  });

  it('masks automation tells (webdriver off, window.chrome present)', async () => {
    const win = browser.window('w1')!;
    expect(JSON.parse(await win.eval('navigator.webdriver'))).toBe(false);
    expect(JSON.parse(await win.eval('!!window.chrome'))).toBe(true);
  });

  it('returns rendered text via content()', async () => {
    const win = browser.window('w1')!;
    const text = await win.content();
    expect(text).toContain('Widgets');
    expect(text).toContain('Welcome to widgets.');
  });

  it('closes a window and isolates separate windows', async () => {
    await browser.openWindow('w2');
    expect(browser.windowIds().sort()).toEqual(['w1', 'w2']);
    await browser.closeWindow('w1');
    expect(browser.windowIds()).toEqual(['w2']);
    expect(browser.window('w1')).toBeUndefined();
  });
});
