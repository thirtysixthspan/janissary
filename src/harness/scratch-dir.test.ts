import { describe, it, expect, vi, beforeEach } from 'vitest';
import { harnessSpawnEnv } from './scratch-dir.js';

// The environment merge in isolation. The browser server itself is stubbed — starting a real one
// would launch Chromium, which no test in this suite does (see `e2e-server-lazy.test.ts` for the
// lifecycle, and `temp/`-run manual checks for a real browser).

const { startE2EBrowserServer, startLazyE2EBrowserServer } = vi.hoisted(() => ({
  startE2EBrowserServer: vi.fn(),
  startLazyE2EBrowserServer: vi.fn(),
}));
vi.mock('../browser/e2e-server.js', () => ({ startE2EBrowserServer, startLazyE2EBrowserServer }));

vi.mock('node:fs', () => ({ mkdirSync: vi.fn() }));

const BROWSER_ENV = {
  JANISSARY_BROWSER_WS_ENDPOINT: 'ws://127.0.0.1:50123/published-token',
  JANISSARY_PLAYWRIGHT: '/app/node_modules/playwright/index.js',
};

beforeEach(() => {
  vi.clearAllMocks();
  startLazyE2EBrowserServer.mockReturnValue({ env: BROWSER_ENV, handle: { close: vi.fn() } });
});

function spawnEnv(name: string, browser: boolean) {
  return harnessSpawnEnv({ name, cwd: '/ws/proj', label: 'bot', browser, onBrowserGone: vi.fn() });
}

describe('harnessSpawnEnv without a browser', () => {
  // The non-`-b` path must be byte-for-byte what it was before the browser existed, `undefined`
  // included — every harness but claude has no environment overrides at all.
  it('returns claude\'s own overrides and no handle', () => {
    expect(spawnEnv('claude', false)).toEqual({
      env: { CLAUDE_CODE_TMPDIR: '/ws/proj/.janissary/temp', DISABLE_AUTOUPDATER: '1' },
    });
  });

  it.each(['opencode', 'codex'])('returns undefined for %s, exactly as harnessEnv does', (name) => {
    expect(spawnEnv(name, false)).toEqual({ env: undefined });
  });

  it('never starts a browser', () => {
    spawnEnv('claude', false);
    spawnEnv('opencode', false);
    expect(startLazyE2EBrowserServer).not.toHaveBeenCalled();
  });
});

describe('harnessSpawnEnv with a browser', () => {
  it('merges both variables alongside claude\'s CLAUDE_CODE_TMPDIR', () => {
    expect(spawnEnv('claude', true).env).toEqual({
      CLAUDE_CODE_TMPDIR: '/ws/proj/.janissary/temp',
      DISABLE_AUTOUPDATER: '1',
      ...BROWSER_ENV,
    });
  });

  // Nothing here is harness-specific: a harness with no overrides of its own still gets the browser.
  it.each(['opencode', 'codex'])('returns the two variables alone for %s', (name) => {
    expect(spawnEnv(name, true).env).toEqual(BROWSER_ENV);
  });

  it('hands back the handle so the caller can own its disposal', () => {
    const handle = { close: vi.fn() };
    startLazyE2EBrowserServer.mockReturnValue({ env: BROWSER_ENV, handle });
    expect(spawnEnv('claude', true).handle).toBe(handle);
  });

  // The browser's own port is not spawn metadata any more: the Seatbelt profile denies the whole
  // reserved band statically, so nothing has to be threaded through to the spawn to deny one port.
  it('carries the guarded endpoint and no private port at all', () => {
    const result = spawnEnv('claude', true);
    expect(result).not.toHaveProperty('browserPort');
    expect(result.env?.JANISSARY_BROWSER_WS_ENDPOINT).toBe(BROWSER_ENV.JANISSARY_BROWSER_WS_ENDPOINT);
  });

  it('starts the browser under the tab\'s label, so its workspace is named for the tab', () => {
    spawnEnv('claude', true);
    expect(startLazyE2EBrowserServer).toHaveBeenCalledWith(expect.objectContaining({ label: 'bot' }));
  });

  // The eager entry point is the same sequence plus a kick, and the whole point of the connect-
  // triggered browser is that nothing kicks. This is the one place that knows which of the two a
  // harness reaches for, so it is where that is worth saying.
  it('reaches for the connect-triggered builder, never the one that starts a browser now', () => {
    spawnEnv('claude', true);
    expect(startLazyE2EBrowserServer).toHaveBeenCalledTimes(1);
    expect(startE2EBrowserServer).not.toHaveBeenCalled();
  });

  it('passes the caller\'s onGone through untouched', () => {
    const onBrowserGone = vi.fn();
    harnessSpawnEnv({ name: 'claude', cwd: '/ws/proj', label: 'bot', browser: true, onBrowserGone });
    const passed = startLazyE2EBrowserServer.mock.calls[0][0] as { onGone: (m: string) => void };
    passed.onGone('e2e browser exited');
    expect(onBrowserGone).toHaveBeenCalledWith('e2e browser exited');
  });
});
