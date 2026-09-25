import { vi } from 'vitest';
import { PassThrough } from 'node:stream';
import type * as E2EPorts from './e2e-ports.js';
import { startE2EBrowserServer, startLazyE2EBrowserServer } from './e2e-server.js';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  startE2EGuard: vi.fn(),
  sandboxSpawn: vi.fn(),
  allocateBrowserScratch: vi.fn(),
  scratchRemove: vi.fn(),
  releasedPorts: [] as number[],
  portsThrow: '',
  chromiumBundleDir: vi.fn(() => '/pw/Chrome.app'),
  playwrightPackagePaths: vi.fn(() => ({
    entry: '/app/node_modules/playwright/index.js',
    dirs: ['/app/node_modules/playwright', '/app/node_modules/playwright-core'],
  })),
}));

export function e2eServerMocks() {
  return mocks;
}

vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('./e2e-guard.js', () => ({ startE2EGuard: mocks.startE2EGuard }));
vi.mock('../sandbox/index.js', () => ({ sandboxSpawn: mocks.sandboxSpawn }));
vi.mock('./playwright-paths.js', () => ({
  chromiumBundleDir: mocks.chromiumBundleDir,
  playwrightPackagePaths: mocks.playwrightPackagePaths,
}));
vi.mock('./e2e-scratch.js', () => ({ allocateBrowserScratch: mocks.allocateBrowserScratch }));
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

export type ChildStub = {
  on: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  handlers: Map<string, (...args: unknown[]) => void>;
  // Real streams rather than mocks, so the tail the session keeps is read through the same
  // `setEncoding`/`readable`/`read()` path a spawned child's pipes go through.
  stdout: PassThrough;
  stderr: PassThrough;
  // Write to the child's stderr the way a browser that is about to die would.
  say: (text: string) => void;
};

function makeChild(): ChildStub {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const stderr = new PassThrough();
  return {
    handlers,
    stdout: new PassThrough(),
    stderr,
    say: (text: string) => { stderr.write(text); },
    kill: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => { handlers.set(event, handler); }),
  };
}

export let child: ChildStub;
export let guardClose: ReturnType<typeof vi.fn>;

export function resetE2EServerFixture(): void {
  vi.clearAllMocks();
  mocks.releasedPorts.length = 0;
  mocks.portsThrow = '';
  child = makeChild();
  guardClose = vi.fn();
  mocks.spawn.mockReturnValue(child);
  mocks.startE2EGuard.mockReturnValue({ close: guardClose });
  // One directory per allocation, so a second browser behind the same endpoint is distinguishable
  // from the first. The first keeps the name the rest of the suite has always asserted.
  let allocated = 0;
  mocks.allocateBrowserScratch.mockImplementation(() => {
    allocated += 1;
    const suffix = allocated === 1 ? '' : `-${allocated}`;
    return {
      dir: `/ws/browsers/bot-token${suffix}`,
      tempDir: `/ws/browsers/bot-token${suffix}.tmp`,
      remove: mocks.scratchRemove,
    };
  });
  mocks.sandboxSpawn.mockImplementation((_options: unknown, command: string, args: string[]) => ({
    command,
    args,
    env: { TMPDIR: '/scrubbed' },
  }));
}

export function start(onGone = vi.fn()) {
  return { onGone, ...startE2EBrowserServer({ label: 'bot', onGone }) };
}

export function startLazy(onGone = vi.fn()) {
  return { onGone, ...startLazyE2EBrowserServer({ label: 'bot', onGone }) };
}

// What one guard was told. The internal address the browser sits behind is no longer part of that —
// the guard asks for it per client — so it is read back from what the child was actually given.
export type GuardCall = {
  port: number;
  wsPath: string;
  ensureUpstream: () => Promise<string>;
  onError: (message: string) => void;
};

export function guardCall(index = 0): GuardCall {
  return mocks.startE2EGuard.mock.calls[index][0] as GuardCall;
}

type SpawnOptions = { env: NodeJS.ProcessEnv; cwd: string; stdio: unknown };

export function childCall(index = 0) {
  const [command, args, options] = mocks.spawn.mock.calls[index] as [string, string[], SpawnOptions];
  return { command, args, ...options };
}

export function internalPort(index = 0): number {
  const { args } = childCall(index);
  return Number(args[args.indexOf('--port') + 1]);
}

export function internalPath(index = 0): string {
  return childCall(index).env.JANISSARY_E2E_WS_PATH ?? '';
}
