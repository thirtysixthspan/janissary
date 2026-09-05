import { beforeEach, describe, expect, it, vi } from 'vitest';
import { harnessSpawnEnv } from '../harness/scratch-dir.js';
import { spawnPty } from '../pty.js';
import { spawnShell } from '../shell.js';
import type { ServerFrame } from './protocol.js';
import { RemoteProcesses } from './serve-processes.js';

vi.mock('../pty.js');
vi.mock('../shell.js');
vi.mock('../harness/scratch-dir.js', () => ({ harnessSpawnEnv: vi.fn() }));

const BROWSER_ENV = {
  JANISSARY_BROWSER_WS_ENDPOINT: 'ws://127.0.0.1:51000/tok',
  JANISSARY_PLAYWRIGHT: '/app/node_modules/playwright/index.js',
};

function fakeShell() {
  return {
    stdin: { writable: true, write: vi.fn() },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  };
}

describe('RemoteProcesses e2e browser', () => {
  let close: ReturnType<typeof vi.fn>;
  let ptyHandlers: { onExit: (id: string, code: number) => void } | undefined;

  beforeEach(() => {
    close = vi.fn();
    ptyHandlers = undefined;
    vi.mocked(spawnPty).mockReset().mockImplementation((...args: unknown[]) => {
      ptyHandlers = args[3] as { onExit: (id: string, code: number) => void };
      return { id: 'pty1', program: 'claude', write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
    });
    vi.mocked(spawnShell).mockReset().mockReturnValue(fakeShell() as never);
    vi.mocked(harnessSpawnEnv).mockReset().mockImplementation((options) => (options.browser
      ? { env: BROWSER_ENV, handle: { close } }
      : { env: undefined }));
  });

  function spawnHarness(browser: boolean, send = vi.fn()) {
    const processes = new RemoteProcesses(send, '/remote/workspace', 'claude');
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty',
      harness: 'claude', cols: 80, rows: 24, browser,
    });
    return { processes, send };
  }

  it('starts the remote\'s own browser and merges its variables into the spawn', () => {
    spawnHarness(true);
    expect(vi.mocked(harnessSpawnEnv)).toHaveBeenCalledWith(expect.objectContaining({
      name: 'claude', cwd: '/remote/workspace', browser: true,
    }));
    expect(vi.mocked(spawnPty).mock.calls[0]?.[7]).toEqual(BROWSER_ENV);
    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toEqual({
      workspaceDir: '/remote/workspace', offline: undefined, tokens: {},
    });
  });

  it('starts no browser without the flag', () => {
    spawnHarness(false);
    expect(vi.mocked(harnessSpawnEnv)).toHaveBeenCalledWith(expect.objectContaining({ browser: false }));
    expect(vi.mocked(spawnPty).mock.calls[0]?.[7]).toBeUndefined();
  });

  it('closes the browser when the session is killed', () => {
    spawnHarness(true).processes.kill('r1');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes the browser when the harness exits naturally', () => {
    spawnHarness(true);
    ptyHandlers?.onExit('r1', 0);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes the browser for every session when the server tears them all down', () => {
    spawnHarness(true).processes.killAll();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('sends browser-exited when the remote\'s browser is gone', () => {
    const { send } = spawnHarness(true);
    vi.mocked(harnessSpawnEnv).mock.calls[0][0].onBrowserGone('e2e browser exited');
    expect(send).toHaveBeenCalledWith({ type: 'browser-exited', id: 'r1' } satisfies ServerFrame);
  });

  it('sends browser-exited when the remote\'s browser fails to start at all', () => {
    const { send } = spawnHarness(true);
    vi.mocked(harnessSpawnEnv).mock.calls[0][0].onBrowserGone('e2e browser failed to start: ENOENT');
    expect(send).toHaveBeenCalledWith({ type: 'browser-exited', id: 'r1' });
  });
});

describe('RemoteProcesses with two live browser sessions', () => {
  let closes: ReturnType<typeof vi.fn>[];
  let exits: ((id: string, code: number) => void)[];

  beforeEach(() => {
    closes = [];
    exits = [];
    vi.mocked(spawnPty).mockReset().mockImplementation((...args: unknown[]) => {
      const handlers = args[3] as { onExit: (id: string, code: number) => void };
      exits.push(handlers.onExit);
      return { id: 'pty', program: 'claude', write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
    });
    vi.mocked(spawnShell).mockReset().mockReturnValue(fakeShell() as never);
    vi.mocked(harnessSpawnEnv).mockReset().mockImplementation(() => {
      const sessionClose = vi.fn();
      closes.push(sessionClose);
      return { env: BROWSER_ENV, handle: { close: sessionClose } };
    });
  });

  function spawnTwo() {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'claude');
    for (const id of ['r1', 'r2']) {
      processes.spawn({
        type: 'spawn', id, program: 'claude', command: 'claude', mode: 'pty',
        harness: 'claude', cols: 80, rows: 24, browser: true,
      });
    }
    return processes;
  }

  it('starts a separate browser for each, under the one channel label', () => {
    spawnTwo();
    expect(closes).toHaveLength(2);
    expect(vi.mocked(harnessSpawnEnv).mock.calls.map(([options]) => options.label))
      .toEqual(['claude', 'claude']);
  });

  it('closes only the killed session\'s browser', () => {
    spawnTwo().kill('r1');
    expect(closes[0]).toHaveBeenCalledTimes(1);
    expect(closes[1]).not.toHaveBeenCalled();
  });

  it('closes only the exiting session\'s browser', () => {
    spawnTwo();
    exits[1]('r2', 0);
    expect(closes[1]).toHaveBeenCalledTimes(1);
    expect(closes[0]).not.toHaveBeenCalled();
  });

  it('closes both when the server tears every session down', () => {
    spawnTwo().killAll();
    expect(closes[0]).toHaveBeenCalledTimes(1);
    expect(closes[1]).toHaveBeenCalledTimes(1);
  });
});

describe('RemoteProcesses when the PTY fails to start', () => {
  let close: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    close = vi.fn();
    vi.mocked(spawnShell).mockReset().mockReturnValue(fakeShell() as never);
    vi.mocked(spawnPty).mockReset().mockImplementation(() => { throw new Error('pty refused'); });
    vi.mocked(harnessSpawnEnv).mockReset().mockReturnValue({ env: BROWSER_ENV, handle: { close } });
  });

  function spawnFailing() {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'claude');
    expect(() => processes.spawn({
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty',
      harness: 'claude', cols: 80, rows: 24, browser: true,
    })).toThrow('pty refused');
    return processes;
  }

  it('closes the browser it had already started', () => {
    spawnFailing();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('forgets it, so a later kill for that id does not close it twice', () => {
    spawnFailing().kill('r1');
    expect(close).toHaveBeenCalledTimes(1);
  });
});
