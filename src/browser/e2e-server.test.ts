import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startE2EBrowserServer } from './e2e-server.js';

// The lifecycle, with the guard, the child process, and the workspace all stubbed — no real
// Chromium starts in this suite, and none should: the closest precedent is `tab.test.ts`, which
// stubs `./index.js` for the same reason. What a real browser proves is in the plan's manual checks.

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  startE2EGuard: vi.fn(),
  sandboxSpawn: vi.fn(),
  allocateBrowserScratch: vi.fn(),
  scratchRemove: vi.fn(),
  chromiumBundleDir: vi.fn(() => '/pw/Chrome.app'),
  playwrightPackagePaths: vi.fn(() => ({ entry: '/app/node_modules/playwright/index.js', dirs: ['/app/node_modules/playwright', '/app/node_modules/playwright-core'] })),
}));

vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('./e2e-guard.js', () => ({ startE2EGuard: mocks.startE2EGuard }));
vi.mock('../sandbox/index.js', () => ({ sandboxSpawn: mocks.sandboxSpawn }));
vi.mock('./playwright-paths.js', () => ({
  chromiumBundleDir: mocks.chromiumBundleDir,
  playwrightPackagePaths: mocks.playwrightPackagePaths,
}));
vi.mock('./e2e-scratch.js', () => ({ allocateBrowserScratch: mocks.allocateBrowserScratch }));

type ChildStub = { on: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn>; handlers: Map<string, (arg?: unknown) => void> };

function makeChild(): ChildStub {
  const handlers = new Map<string, (arg?: unknown) => void>();
  return {
    handlers,
    kill: vi.fn(),
    on: vi.fn((event: string, handler: (arg?: unknown) => void) => { handlers.set(event, handler); }),
  };
}

let child: ChildStub;
let guardClose: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  child = makeChild();
  guardClose = vi.fn();
  mocks.spawn.mockReturnValue(child);
  mocks.startE2EGuard.mockReturnValue({ close: guardClose });
  mocks.allocateBrowserScratch.mockReturnValue({
    dir: '/ws/browsers/bot-token', tempDir: '/ws/browsers/bot-token.tmp', remove: mocks.scratchRemove,
  });
  mocks.sandboxSpawn.mockImplementation((_options: unknown, command: string, args: string[]) => ({
    command, args, env: { TMPDIR: '/scrubbed' },
  }));
});

function start(onGone = vi.fn()) {
  return { onGone, ...startE2EBrowserServer({ label: 'bot', onGone }) };
}

describe('startE2EBrowserServer environment', () => {
  it('publishes the guard\'s endpoint and never the browser\'s own', () => {
    const { env } = start();
    const guardCall = mocks.startE2EGuard.mock.calls[0][0] as {
      port: number; wsPath: string; upstreamPort: number; upstreamPath: string;
    };
    const endpoint = env.JANISSARY_BROWSER_WS_ENDPOINT ?? '';
    expect(endpoint).toBe(`ws://127.0.0.1:${guardCall.port}${guardCall.wsPath}`);
    expect(endpoint).not.toContain(guardCall.upstreamPath);
    expect(endpoint).not.toContain(String(guardCall.upstreamPort));
  });

  it('mints two distinct unguessable paths and two distinct ports', () => {
    start();
    const call = mocks.startE2EGuard.mock.calls[0][0] as {
      port: number; wsPath: string; upstreamPort: number; upstreamPath: string;
    };
    expect(call.wsPath).not.toBe(call.upstreamPath);
    expect(call.port).not.toBe(call.upstreamPort);
    // `makeToken()` is 24 random bytes base64url-encoded, so both are long and opaque.
    expect(call.wsPath.length).toBeGreaterThan(24);
    expect(call.upstreamPath.length).toBeGreaterThan(24);
  });

  it('resolves JANISSARY_PLAYWRIGHT to the package entry the server is running', () => {
    expect(start().env.JANISSARY_PLAYWRIGHT).toBe('/app/node_modules/playwright/index.js');
  });

  it('carries exactly the two variables', () => {
    const names = Object.keys(start().env).toSorted((a, b) => a.localeCompare(b));
    expect(names).toEqual(['JANISSARY_BROWSER_WS_ENDPOINT', 'JANISSARY_PLAYWRIGHT']);
  });

  // Nothing here awaits: the endpoint is computed before the browser starts, so the PTY spawn is
  // never gated on Chromium coming up.
  it('returns synchronously, before the child can have started', () => {
    const { env } = start();
    expect(env.JANISSARY_BROWSER_WS_ENDPOINT).toBeTruthy();
  });
});

describe('startE2EBrowserServer workspace', () => {
  it('allocates its scratch directory rather than deriving one from the label', () => {
    start();
    expect(mocks.allocateBrowserScratch).toHaveBeenCalledTimes(1);
    expect(mocks.allocateBrowserScratch).toHaveBeenCalledWith('bot');
  });

  it('confines the child with the browser profile against that workspace', () => {
    start();
    const [options] = mocks.sandboxSpawn.mock.calls[0] as [{ workspaceDir: string; browser: { chromiumDir: string } }];
    expect(options.workspaceDir).toBe('/ws/browsers/bot-token');
    expect(options.browser.chromiumDir).toBe('/pw/Chrome.app');
  });

  it('points the child\'s TMPDIR at the allocated temp sibling', () => {
    start();
    const spawnOptions = (mocks.spawn.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv }])[2];
    expect(spawnOptions.env.TMPDIR).toBe('/ws/browsers/bot-token.tmp');
  });

  it('passes the child the internal port and path, not the published ones', () => {
    start();
    const guardCall = mocks.startE2EGuard.mock.calls[0][0] as { upstreamPort: number; upstreamPath: string };
    const [, args] = mocks.spawn.mock.calls[0] as [string, string[]];
    expect(args).toContain('e2e-browser');
    expect(args[args.indexOf('--port') + 1]).toBe(String(guardCall.upstreamPort));
    expect(args[args.indexOf('--ws-path') + 1]).toBe(guardCall.upstreamPath);
    expect(args[args.indexOf('--dir') + 1]).toBe('/ws/browsers/bot-token');
  });
});

describe('startE2EBrowserServer close', () => {
  // Removal goes through the allocation's own handle, so it can only reach the two paths this
  // launch created — never a path recomputed from a label at close time.
  it('stops the guard, kills the child, and removes its own scratch allocation', () => {
    const { handle } = start();
    handle.close();
    expect(guardClose).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(mocks.scratchRemove).toHaveBeenCalledTimes(1);
  });

  it('is idempotent', () => {
    const { handle } = start();
    handle.close();
    handle.close();
    handle.close();
    expect(guardClose).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(mocks.scratchRemove).toHaveBeenCalledTimes(1);
  });

  // A `-b` tab that is closed kills its PTY, which disposes the runtime, which closes this — and the
  // child's own exit then arrives. That exit is the user closing the tab, not a browser that died.
  it('suppresses a later onGone', () => {
    const { handle, onGone } = start();
    handle.close();
    child.handlers.get('exit')?.();
    expect(onGone).not.toHaveBeenCalled();
  });
});

describe('startE2EBrowserServer failure reporting', () => {
  it('fires onGone exactly once for a child that exits unexpectedly', () => {
    const { onGone } = start();
    child.handlers.get('exit')?.();
    child.handlers.get('exit')?.();
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('exited'));
  });

  it('fires onGone for a child that never starts', () => {
    const { onGone } = start();
    child.handlers.get('error')?.(new Error('ENOENT'));
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('ENOENT'));
  });

  // The port probe's race: another process took the port between it being picked and bound. Losing
  // it is not silent.
  it('fires onGone when the guard cannot listen', () => {
    const { onGone } = start();
    const guardOptions = mocks.startE2EGuard.mock.calls[0][0] as { onError: (m: string) => void };
    guardOptions.onError('e2e browser guard failed to listen: EADDRINUSE');
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('EADDRINUSE'));
  });

  it('fires onGone when the spawn itself throws', () => {
    mocks.spawn.mockImplementation(() => { throw new Error('spawn refused'); });
    const { onGone, handle } = start();
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('spawn refused'));
    // Still closable, with no child to kill.
    expect(() => handle.close()).not.toThrow();
  });
});
