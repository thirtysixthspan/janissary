import { vi } from 'vitest';
import { PassThrough } from 'node:stream';
import type * as E2EPorts from './e2e-ports.js';
import type { E2ESession } from './e2e-session.js';
import { startE2EBrowserServer, startLazyE2EBrowserServer } from './e2e-server.js';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  startE2EGuard: vi.fn(),
  sandboxSpawn: vi.fn(),
  allocateBrowserScratch: vi.fn(),
  scratchRemove: vi.fn(),
  releasedPorts: [] as number[],
  portsThrow: '',
  // Whether the stubbed child has bound its port. A case that wants to watch a connect be held calls
  // `holdBrowserPort` and says otherwise; every other case lets the child be listening from the
  // moment it is forked, which is what a launched browser looks like by the time a connect asks.
  browserListening: true,
  // Whether the wait gives up the way the real probe does at its bound, thirty seconds on, rather than
  // waiting on the flag above. For a launch that hangs, which only the clock ends.
  probeTimesOut: false,
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
// The stand-in for the real wait, which probes a real port and would leave every case here waiting
// on a socket nobody opens. It answers on the same two facts the real one does — the child is
// listening, or the session ended — so a case can hold a connect open by holding the port. The
// module itself is pinned on real sockets by `e2e-ready.test.ts`.
vi.mock('./e2e-ready.js', () => ({
  waitForListening: (session: E2ESession) => new Promise<void>((resolve, reject) => {
    if (mocks.probeTimesOut) {
      setTimeout(() => reject(new Error('e2e browser did not start listening in time')), 30_000);
      return;
    }
    const probe = (): void => {
      if (mocks.browserListening) return resolve();
      if (session.closed) return reject(new Error('e2e browser exited before it was listening'));
      setTimeout(probe, 5);
    };
    probe();
  }),
}));
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
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  // One stub stands in for every child a tab ever spawns, so a case that walks the restart budget
  // hangs a hundred generations' worth of output readers off a single stream. Real children each get
  // their own pipes and one reader apiece, so the listener count Node warns about never reaches them.
  stdout.setMaxListeners(0);
  stderr.setMaxListeners(0);
  return {
    handlers,
    stdout,
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
  mocks.browserListening = true;
  mocks.probeTimesOut = false;
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

// The eager entry point, with a browser up before the case runs: the kick it performs is the guard's
// own supplier, so asking the guard is asking for the browser. A kick that failed is swallowed here
// as it is in production — the case is about what was released and reported, not about the throw.
export async function start(onGone = vi.fn()) {
  const server = { onGone, ...startE2EBrowserServer({ label: 'bot', onGone }) };
  // Nothing to ask when the port band was full: there is no guard and no browser to ask for.
  if (mocks.startE2EGuard.mock.calls.length > 0) {
    try { await guardCall().ensureUpstream(); } catch { /* reported through onGone, as in production */ }
  }
  return server;
}

export function startLazy(onGone = vi.fn()) {
  return { onGone, ...startLazyE2EBrowserServer({ label: 'bot', onGone }) };
}

// The stubbed child has not bound its port yet, so the next connect is held where it is until
// `browserIsListening` says otherwise.
export function holdBrowserPort(): void {
  mocks.browserListening = false;
}

export function browserIsListening(): void {
  mocks.browserListening = true;
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
