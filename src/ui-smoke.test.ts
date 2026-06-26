import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { startServer, type RunningServer } from './index.js';

// End-to-end smoke test: build the real web bundle, serve it from the real server, drive it in a
// real browser, type `help`, and confirm the response renders. Unlike index.test.ts (which talks to
// the server over a raw WebSocket), this exercises the actual React UI — so it catches frontend
// regressions where the wire protocol works but the rendered app does not.

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDist = path.join(root, 'web', 'dist');

let browser: Browser;
let server: RunningServer | null = null;

beforeAll(async () => {
  // Build from current source so the smoke test reflects HEAD, not a stale dist.
  execSync('npm run build:web', { cwd: root, stdio: 'pipe' });
  browser = await chromium.launch({ args: ['--no-sandbox'] });
}, 120_000);

afterAll(async () => {
  await server?.close();
  server = null;
  await browser?.close();
});

describe('UI smoke', () => {
  it('loads the app and runs `help` end-to-end', async () => {
    server = await startServer({ webDir: webDist });
    const page = await browser.newPage();

    // Surface anything the bundle throws at load or while handling the command.
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => { pageErrors.push(String(error)); });
    page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(`console.error: ${message.text()}`); });

    await page.goto(server.url);

    // The command line only mounts after the client connects and the first tab arrives, so waiting
    // for it also asserts the WebSocket handshake + initial state render worked.
    const input = page.locator('.command input');
    await input.waitFor({ state: 'visible', timeout: 15_000 });
    expect(pageErrors, `errors during load:\n${pageErrors.join('\n')}`).toEqual([]);

    // Type the command the way a user would — real per-key events, not a value injection — so a
    // broken onChange/onKeyDown path fails here instead of being bypassed.
    await input.click();
    await input.pressSequentially('help');
    expect(await input.inputValue()).toBe('help');

    await input.press('Enter');

    // `help` echoes the prompt and renders README-derived Markdown into the transcript.
    await page.locator('.line.prompt', { hasText: 'help' }).first().waitFor({ state: 'visible', timeout: 15_000 });
    const markdown = page.locator('.line.markdown').first();
    await markdown.waitFor({ state: 'visible', timeout: 15_000 });
    expect(((await markdown.textContent()) ?? '').trim().length).toBeGreaterThan(20);

    // The input clears after a successful submit.
    expect(await input.inputValue()).toBe('');

    expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);

    await page.close();
  }, 30_000);
});
