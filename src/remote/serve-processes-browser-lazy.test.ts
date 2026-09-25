import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  child, e2eServerMocks, guardCall, guardClose, resetE2EServerFixture,
} from '../browser/e2e-server-test-fixture.js';
import { spawnPty } from '../pty.js';
import { spawnShell } from '../shell/index.js';
import { RemoteProcesses } from './serve-processes.js';

// The far side of a `-b` harness, running the real `harnessSpawnEnv` and the real lazy browser start
// against the browser fixture's stubs. `serve-processes-browser.test.ts` covers the same call site
// with the environment stubbed out; what can only be said here is that the remote host ends up with
// a guard and no browser until one of its own remote clients connects — and that every teardown path
// closes both, whichever of the two existed.

vi.mock('../pty.js');
vi.mock('../shell/index.js');
// The far side's harness environment builds claude's temp directory under its own workspace, which
// does not exist in a test. Nothing else in this graph reaches the filesystem.
vi.mock('node:fs', () => ({ mkdirSync: vi.fn() }));

const mocks = e2eServerMocks();
beforeEach(() => {
  resetE2EServerFixture();
  vi.mocked(spawnPty).mockReset().mockReturnValue({ id: 'pty1', program: 'claude', write: vi.fn(), resize: vi.fn(), kill: vi.fn() });
  vi.mocked(spawnShell).mockReset().mockReturnValue({ stdin: { writable: true, write: vi.fn() }, on: vi.fn(), kill: vi.fn() } as never);
});

let onExit: (id: string, code: number) => void = () => {};

function spawnHarness(browser: boolean) {
  const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'claude');
  vi.mocked(spawnPty).mockImplementation((...args: unknown[]) => {
    onExit = (args[3] as { onExit: (id: string, code: number) => void }).onExit;
    return { id: 'pty1', program: 'claude', write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
  });
  processes.spawn({
    type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty',
    harness: 'claude', cols: 80, rows: 24, browser,
  });
  return processes;
}

function connect() {
  return guardCall().ensureUpstream();
}

describe('a remote -b session', () => {
  it('builds its own guard on the far side and starts no browser', () => {
    spawnHarness(true);
    expect(mocks.startE2EGuard).toHaveBeenCalledTimes(1);
    expect(mocks.allocateBrowserScratch).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('publishes the far side\'s own endpoint in the remote spawn\'s environment', () => {
    spawnHarness(true);
    const env = vi.mocked(spawnPty).mock.calls[0]?.[7] as Record<string, string>;
    expect(env.JANISSARY_BROWSER_WS_ENDPOINT).toBe(`ws://127.0.0.1:${guardCall().port}${guardCall().wsPath}`);
    expect(env.JANISSARY_PLAYWRIGHT).toBe('/app/node_modules/playwright/index.js');
  });

  it('starts a browser when a remote client connects, and only then', async () => {
    spawnHarness(true);
    await connect();
    expect(mocks.allocateBrowserScratch).toHaveBeenCalledWith('claude');
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it('closes the guard and the browser when the session is killed', async () => {
    const processes = spawnHarness(true);
    await connect();
    processes.kill('r1');
    expect(guardClose).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(mocks.scratchRemove).toHaveBeenCalledTimes(1);
  });

  it('closes the guard alone when the session is killed before any browser started', () => {
    spawnHarness(true).kill('r1');
    expect(guardClose).toHaveBeenCalledTimes(1);
    expect(child.kill).not.toHaveBeenCalled();
    expect(mocks.scratchRemove).not.toHaveBeenCalled();
  });

  it('closes the guard and the browser when the harness exits naturally', async () => {
    spawnHarness(true);
    await connect();
    onExit('r1', 0);
    expect(guardClose).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it('closes the guard when the PTY never started', () => {
    vi.mocked(spawnPty).mockImplementation(() => { throw new Error('pty refused'); });
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'claude');
    expect(() => processes.spawn({
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty',
      harness: 'claude', cols: 80, rows: 24, browser: true,
    })).toThrow('pty refused');
    expect(guardClose).toHaveBeenCalledTimes(1);
  });

  it('starts nothing at all without the flag, and names no browser in the environment', () => {
    spawnHarness(false);
    expect(mocks.startE2EGuard).not.toHaveBeenCalled();
    const env = vi.mocked(spawnPty).mock.calls[0]?.[7] as Record<string, string>;
    expect(Object.keys(env)).toEqual(['CLAUDE_CODE_TMPDIR', 'DISABLE_AUTOUPDATER']);
  });
});
