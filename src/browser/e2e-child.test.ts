import { describe, it, expect, vi, beforeEach } from 'vitest';
import { E2E_LOOPBACK_HOST } from './e2e-loopback.js';
import { runE2EBrowser } from './e2e-child.js';

// `playwright` is stubbed: no Chromium starts in this suite, for the same reason none starts in
// `e2e-server.test.ts`. What a real browser proves is in the plan's manual checks.

const mocks = vi.hoisted(() => ({
  launchServer: vi.fn(),
  executablePath: vi.fn(() => '/pw/chrome-mac/Chromium'),
}));

vi.mock('playwright', () => ({
  chromium: { launchServer: mocks.launchServer, executablePath: mocks.executablePath },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.launchServer.mockResolvedValue({ on: vi.fn() });
});

async function launchOptions(): Promise<Record<string, unknown>> {
  await runE2EBrowser({ port: 51_234, wsPath: '/internal-token', dir: '/ws/browsers/bot-token' });
  return mocks.launchServer.mock.calls[0][0] as Record<string, unknown>;
}

describe('runE2EBrowser listener address', () => {
  // Playwright's `host` defaults to the *name* `localhost`. The guard dials an address, so a host
  // that resolves that name to `::1` first would leave the browser listening where the guard never
  // looks — alive, unreachable, and with nothing to report.
  it('binds the address the guard dials rather than leaving the name to the resolver', async () => {
    const options = await launchOptions();
    expect(options.host).toBe(E2E_LOOPBACK_HOST);
  });

  it('binds loopback only, never a wildcard address', async () => {
    const options = await launchOptions();
    expect(options.host).not.toBe('0.0.0.0');
    expect(options.host).not.toBe('::');
  });
});

describe('runE2EBrowser launch options', () => {
  it('keeps the port and path it was given', async () => {
    const options = await launchOptions();
    expect(options.port).toBe(51_234);
    expect(options.wsPath).toBe('/internal-token');
  });

  it('stays headless, on Playwright\'s own binary, downloading into the scratch directory', async () => {
    const options = await launchOptions();
    expect(options.headless).toBe(true);
    expect(options.executablePath).toBe('/pw/chrome-mac/Chromium');
    expect(options.downloadsPath).toBe('/ws/browsers/bot-token/downloads');
  });
});
