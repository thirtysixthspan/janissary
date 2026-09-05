import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { E2E_LOOPBACK_HOST } from './e2e-loopback.js';
import type * as E2EPorts from './e2e-ports.js';
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
  releasedPorts: [] as number[],
  // Set by the band-exhaustion case below to make the allocator refuse, which is the one failure
  // that happens before this module has acquired anything at all.
  portsThrow: '',
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
// The real allocator, so the reservation it maintains is what the port cases below assert against —
// wrapped only to record which ports each launch gave back.
vi.mock('./e2e-ports.js', async (importOriginal) => {
  const actual = await importOriginal<typeof E2EPorts>();
  return {
    allocateBrowserPorts: () => {
      if (mocks.portsThrow) throw new Error(mocks.portsThrow);
      const ports = actual.allocateBrowserPorts();
      return {
        ...ports,
        release: () => {
          mocks.releasedPorts.push(ports.guardPort, ports.browserPort);
          ports.release();
        },
      };
    },
  };
});

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
  mocks.releasedPorts.length = 0;
  mocks.portsThrow = '';
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

  it('mints two distinct unguessable paths', () => {
    start();
    const call = mocks.startE2EGuard.mock.calls[0][0] as { wsPath: string; upstreamPath: string };
    expect(call.wsPath).not.toBe(call.upstreamPath);
    // `makeToken()` is 24 random bytes base64url-encoded, so both are long and opaque.
    expect(call.wsPath.length).toBeGreaterThan(24);
    expect(call.upstreamPath.length).toBeGreaterThan(24);
  });

  // One address across the guard's bind, its upstream dial, the browser's listener, and this
  // endpoint — so none of them can drift onto a family the others are not on.
  it('names the shared loopback address in the endpoint it hands the agent', () => {
    const endpoint = start().env.JANISSARY_BROWSER_WS_ENDPOINT ?? '';
    expect(endpoint.startsWith(`ws://${E2E_LOOPBACK_HOST}:`)).toBe(true);
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

// Ports come from the allocator, which reserves them, so these are guarantees rather than draws
// that happened to differ (see `e2e-ports.test.ts`).
describe('startE2EBrowserServer ports', () => {
  function guardCall(index: number) {
    return mocks.startE2EGuard.mock.calls[index][0] as { port: number; upstreamPort: number };
  }

  it('never points the guard at its own listening port', () => {
    start();
    expect(guardCall(0).port).not.toBe(guardCall(0).upstreamPort);
  });

  // The browser's own port is not returned to anyone any more — the Seatbelt profile denies the
  // whole band statically, so nothing outside this module needs to know it. What still matters is
  // that it never reaches the harness's environment.
  it('keeps the private browser port out of the harness environment', () => {
    const server = start();
    expect(Object.values(server.env)).not.toContain(String(guardCall(0).upstreamPort));
    expect(server).not.toHaveProperty('browserPort');
  });

  // Every browser port has to come from the denied band, so a full band is a refusal rather than a
  // port drawn from outside it. Nothing has been acquired at that point, so the harness simply
  // launches without a browser and is told why.
  it('reports a full band through onGone and hands back no browser variables', () => {
    mocks.portsThrow = 'no free e2e browser port between 65280 and 65535';
    const server = start();
    expect(server.onGone).toHaveBeenCalledTimes(1);
    expect(String(server.onGone.mock.calls[0][0])).toContain('no free e2e browser port');
    expect(server.env).toEqual({});
    expect(mocks.startE2EGuard).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(() => server.handle.close()).not.toThrow();
  });

  it('gives two live browsers four distinct ports', () => {
    const first = start();
    const second = start();
    const ports = [guardCall(0).port, guardCall(0).upstreamPort, guardCall(1).port, guardCall(1).upstreamPort];
    expect(new Set(ports).size).toBe(4);
    first.handle.close();
    second.handle.close();
  });

  it('frees only the closed browser\'s ports', () => {
    const first = start();
    const second = start();
    first.handle.close();
    const third = start();
    const stillLive = [guardCall(1).port, guardCall(1).upstreamPort];
    expect(stillLive).not.toContain(guardCall(2).port);
    expect(stillLive).not.toContain(guardCall(2).upstreamPort);
    second.handle.close();
    third.handle.close();
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

  // The profile carves in the tree that is actually running, not both and not the root above them,
  // so the entry directory has to follow the same layout decision the launch resolution made.
  it('names the code tree the launch resolved, not the installation root', () => {
    start();
    const [options] = mocks.sandboxSpawn.mock.calls[0] as [{ browser: { appDir: string; appEntryDir: string; playwrightDirs: string[] } }];
    const [, args] = mocks.spawn.mock.calls[0] as [string, string[]];
    const entry = args[args.indexOf('e2e-browser') - 1];
    expect(options.browser.appEntryDir).toBe(path.dirname(entry));
    expect(options.browser.appEntryDir).not.toBe(options.browser.appDir);
    expect(options.browser.playwrightDirs).toEqual([
      '/app/node_modules/playwright', '/app/node_modules/playwright-core',
    ]);
  });

  it('points the child\'s TMPDIR at the allocated temp sibling', () => {
    start();
    const spawnOptions = (mocks.spawn.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv }])[2];
    expect(spawnOptions.env.TMPDIR).toBe('/ws/browsers/bot-token.tmp');
  });

  it('passes the child the internal port and directory, not the published ones', () => {
    start();
    const guardCall = mocks.startE2EGuard.mock.calls[0][0] as { upstreamPort: number; upstreamPath: string };
    const [, args] = mocks.spawn.mock.calls[0] as [string, string[]];
    expect(args).toContain('e2e-browser');
    expect(args[args.indexOf('--port') + 1]).toBe(String(guardCall.upstreamPort));
    expect(args[args.indexOf('--dir') + 1]).toBe('/ws/browsers/bot-token');
  });

  // An argument vector is readable through `ps` by any user on a macOS host, and this token plus the
  // port is a complete bypass of the guard. Asserted against the whole joined command line rather
  // than a named flag, so reintroducing it under any other flag fails too.
  it('keeps the internal path out of the child\'s argument vector', () => {
    start();
    const guardCall = mocks.startE2EGuard.mock.calls[0][0] as { upstreamPath: string };
    const [command, args] = mocks.spawn.mock.calls[0] as [string, string[]];
    expect([command, ...args].join(' ')).not.toContain(guardCall.upstreamPath);
  });

  it('hands the internal path to the child in its environment instead', () => {
    start();
    const guardCall = mocks.startE2EGuard.mock.calls[0][0] as { upstreamPath: string };
    const spawnOptions = (mocks.spawn.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv }])[2];
    expect(spawnOptions.env.JANISSARY_E2E_WS_PATH).toBe(guardCall.upstreamPath);
  });
});

// `node:fs` is deliberately not stubbed in this suite, so a child entry that names nothing cannot
// satisfy the launch: a mocked `spawn` accepts any string, and only the disk says otherwise.
describe('startE2EBrowserServer child launch', () => {
  function spawnCall() {
    return mocks.spawn.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv }];
  }

  it('runs the server\'s own interpreter', () => {
    start();
    expect(spawnCall()[0]).toBe(process.execPath);
  });

  it('gives it a child entry that exists in the tree this process is running', () => {
    start();
    const [, args] = spawnCall();
    const entry = args[args.indexOf('e2e-browser') - 1];
    expect(existsSync(entry)).toBe(true);
  });

  // Whatever the loader chain adds sits ahead of the entry, never between it and the subcommand.
  it('keeps the subcommand and its arguments after the entry', () => {
    start();
    const [, args] = spawnCall();
    expect(args.slice(args.indexOf('e2e-browser'), args.indexOf('e2e-browser') + 2)).toEqual(['e2e-browser', '--port']);
  });

  it('confines the launch it actually spawns', () => {
    start();
    const [command, args] = spawnCall();
    const [, sandboxedCommand, sandboxedArgs] = mocks.sandboxSpawn.mock.calls[0] as [unknown, string, string[]];
    expect(sandboxedCommand).toBe(command);
    expect(sandboxedArgs).toEqual(args);
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

  // The choose-then-bind race: another process took the unreserved candidate before it was bound.
  // Losing it is not silent.
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

// Every way the browser can end releases everything that launch acquired, at the moment it ends —
// not when the tab is eventually disposed. A guard left listening in front of a dead browser, or a
// Chromium left running with no route to it, is the failure this covers.
describe('startE2EBrowserServer failure cleanup', () => {
  function released() {
    return {
      guard: guardClose.mock.calls.length,
      child: child.kill.mock.calls.length,
      scratch: mocks.scratchRemove.mock.calls.length,
    };
  }

  // The lost-race path end to end: another process took the port between it being chosen and being
  // bound, and everything that launch acquired — its ports included — goes back.
  it('releases everything when the guard cannot listen', () => {
    start();
    const guardOptions = mocks.startE2EGuard.mock.calls[0][0] as {
      port: number; upstreamPort: number; onError: (m: string) => void;
    };
    guardOptions.onError('e2e browser guard failed to listen: EADDRINUSE');
    expect(released()).toEqual({ guard: 1, child: 1, scratch: 1 });
    expect(mocks.releasedPorts).toEqual([guardOptions.port, guardOptions.upstreamPort]);
  });

  it('releases everything when the child exits unexpectedly', () => {
    start();
    child.handlers.get('exit')?.();
    expect(released()).toEqual({ guard: 1, child: 1, scratch: 1 });
  });

  it('releases everything when the child never starts', () => {
    start();
    child.handlers.get('error')?.(new Error('ENOENT'));
    expect(released()).toEqual({ guard: 1, child: 1, scratch: 1 });
  });

  // Partway through setup: the scratch directory and the guard were acquired, the spawn was not.
  it('rolls back what it already acquired when the spawn throws', () => {
    mocks.spawn.mockImplementation(() => { throw new Error('spawn refused'); });
    start();
    expect(guardClose).toHaveBeenCalledTimes(1);
    expect(mocks.scratchRemove).toHaveBeenCalledTimes(1);
  });

  // Nothing had been acquired yet, so there is nothing to give back — but the caller is mid-way
  // through building a tab and must not be handed an exception for it.
  it('reports a scratch allocation that fails instead of throwing at its caller', () => {
    mocks.allocateBrowserScratch.mockImplementation(() => { throw new Error('EACCES'); });
    const { onGone, handle } = start();
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('EACCES'));
    expect(mocks.startE2EGuard).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(() => handle.close()).not.toThrow();
  });

  // Killing the child provokes its own exit event. That must not re-enter the teardown or report a
  // second time.
  it('releases once across a failure followed by a close', () => {
    const { onGone, handle } = start();
    child.handlers.get('exit')?.();
    handle.close();
    expect(released()).toEqual({ guard: 1, child: 1, scratch: 1 });
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it('releases once across a close followed by the child\'s exit', () => {
    const { onGone, handle } = start();
    handle.close();
    child.handlers.get('exit')?.();
    expect(released()).toEqual({ guard: 1, child: 1, scratch: 1 });
    expect(onGone).not.toHaveBeenCalled();
  });
});
