import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnPty } from '../pty.js';
import { spawnShell } from '../shell.js';
import { harnessSpawnEnv } from '../harness/scratch-dir.js';
import { RemoteProcesses } from './serve-processes.js';
import type { ServerFrame } from './protocol.js';

vi.mock('../pty.js');
vi.mock('../shell.js');
// The remote builds its own copy of the harness environment, browser included. Stubbed here for the
// same reason the local manager's tests stub it: starting a real one would launch Chromium.
vi.mock('../harness/scratch-dir.js', () => ({ harnessSpawnEnv: vi.fn() }));

const TOKEN = 'github_pat_forwarded';
const CLAUDE_TOKEN = 'sk-ant-oat01-forwarded';
const OPENCODE_TOKEN = 'oc_live_forwarded';
const GEMINI_TOKEN = 'AIzaSyForwarded';
const CREDENTIALS = {
  github: TOKEN, claude: CLAUDE_TOKEN, opencode: OPENCODE_TOKEN, gemini: GEMINI_TOKEN,
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

describe('RemoteProcesses forwarded credentials', () => {
  beforeEach(() => {
    vi.mocked(spawnPty).mockReset().mockReturnValue({
      id: 'pty1', program: 'claude', write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
    });
    vi.mocked(spawnShell).mockReset().mockReturnValue(fakeShell() as never);
    vi.mocked(harnessSpawnEnv).mockReset().mockReturnValue({ env: undefined });
  });

  it('passes every forwarded token to a remote PTY workspace', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'claude', CREDENTIALS);
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty', cols: 80, rows: 24,
    });

    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toEqual({
      workspaceDir: '/remote/workspace', offline: undefined, tokens: CREDENTIALS,
    });
  });

  it('passes every forwarded token to a remote persistent shell', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'agent', CREDENTIALS);
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'bash', command: 'bash', mode: 'pipe', cols: 80, rows: 24,
    });

    expect(vi.mocked(spawnShell)).toHaveBeenCalledWith(0, { JANUS_AGENT_NAME: 'agent' }, {
      workspaceDir: '/remote/workspace', tokens: CREDENTIALS,
    });
  });

  it('uses a joined tab\'s spawn name for its persistent shell', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'creator', CREDENTIALS);
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'bash', command: 'bash', mode: 'pipe', cols: 80, rows: 24,
      agentName: 'joined',
    });

    expect(vi.mocked(spawnShell).mock.calls[0]?.[1]).toEqual({ JANUS_AGENT_NAME: 'joined' });
  });

  // Each token stands on its own: a project that configures only one must not have the other's
  // absence suppress it.
  it('forwards a Claude token on its own when no GitHub token is configured', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'claude', { claude: CLAUDE_TOKEN });
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty', cols: 80, rows: 24,
    });

    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toEqual({
      workspaceDir: '/remote/workspace', offline: undefined, tokens: { claude: CLAUDE_TOKEN },
    });
  });

  it('forwards an OpenCode key on its own when no other token is configured', () => {
    const processes = new RemoteProcesses(vi.fn(), '/remote/workspace', 'opencode', { opencode: OPENCODE_TOKEN });
    processes.spawn({
      type: 'spawn', id: 'r1', program: 'opencode', command: 'opencode', mode: 'pty', cols: 80, rows: 24,
    });

    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toEqual({
      workspaceDir: '/remote/workspace', offline: undefined, tokens: { opencode: OPENCODE_TOKEN },
    });
  });
});

const BROWSER_ENV = {
  JANISSARY_BROWSER_WS_ENDPOINT: 'ws://127.0.0.1:51000/tok',
  JANISSARY_PLAYWRIGHT: '/app/node_modules/playwright/index.js',
};

describe('RemoteProcesses e2e browser', () => {
  let close: ReturnType<typeof vi.fn>;
  let ptyHandlers: { onExit: (id: string, code: number) => void } | undefined;

  beforeEach(() => {
    close = vi.fn();
    ptyHandlers = undefined;
    vi.mocked(spawnPty).mockReset().mockImplementation((..._args: unknown[]) => {
      ptyHandlers = _args[3] as { onExit: (id: string, code: number) => void };
      return { id: 'pty1', program: 'claude', write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
    });
    vi.mocked(spawnShell).mockReset().mockReturnValue(fakeShell() as never);
    vi.mocked(harnessSpawnEnv).mockReset().mockImplementation((options) => (options.browser
      ? { env: BROWSER_ENV, handle: { close }, browserPort: 50_400 }
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
    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).toMatchObject({ browserPort: 50_400 });
  });

  it('starts no browser without the flag', () => {
    spawnHarness(false);
    expect(vi.mocked(harnessSpawnEnv)).toHaveBeenCalledWith(expect.objectContaining({ browser: false }));
    expect(vi.mocked(spawnPty).mock.calls[0]?.[7]).toBeUndefined();
    expect(vi.mocked(spawnPty).mock.calls[0]?.[6]).not.toHaveProperty('browserPort');
  });

  it('closes the browser when the session is killed', () => {
    const { processes } = spawnHarness(true);
    processes.kill('r1');
    expect(close).toHaveBeenCalledTimes(1);
  });

  // A harness that exits on its own must leave nothing running, exactly as a killed one does.
  it('closes the browser when the harness exits naturally', () => {
    spawnHarness(true);
    ptyHandlers?.onExit('r1', 0);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes the browser for every session when the server tears them all down', () => {
    const { processes } = spawnHarness(true);
    processes.killAll();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('sends browser-exited when the remote\'s browser is gone', () => {
    const { send } = spawnHarness(true);
    const options = vi.mocked(harnessSpawnEnv).mock.calls[0][0];
    options.onBrowserGone('e2e browser exited');
    expect(send).toHaveBeenCalledWith({ type: 'browser-exited', id: 'r1' } satisfies ServerFrame);
  });

  it('sends browser-exited when the remote\'s browser fails to start at all', () => {
    const { send } = spawnHarness(true);
    const options = vi.mocked(harnessSpawnEnv).mock.calls[0][0];
    options.onBrowserGone('e2e browser failed to start: ENOENT');
    expect(send).toHaveBeenCalledWith({ type: 'browser-exited', id: 'r1' });
  });
});

// Two browser-enabled sessions on one channel. They share the channel's label, which is what used
// to hand them one scratch directory between them, so the thing worth pinning is that each session
// owns its own browser end to end: its own start, and a teardown that reaches only its own.
describe('RemoteProcesses with two live browser sessions', () => {
  let closes: ReturnType<typeof vi.fn>[];
  let exits: ((id: string, code: number) => void)[];

  beforeEach(() => {
    closes = [];
    exits = [];
    vi.mocked(spawnPty).mockReset().mockImplementation((..._args: unknown[]) => {
      const handlers = _args[3] as { onExit: (id: string, code: number) => void };
      exits.push(handlers.onExit);
      return { id: 'pty', program: 'claude', write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
    });
    vi.mocked(spawnShell).mockReset().mockReturnValue(fakeShell() as never);
    vi.mocked(harnessSpawnEnv).mockReset().mockImplementation(() => {
      const close = vi.fn();
      closes.push(close);
      return { env: BROWSER_ENV, handle: { close } };
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
    const labels = vi.mocked(harnessSpawnEnv).mock.calls.map(([options]) => options.label);
    expect(labels).toEqual(['claude', 'claude']);
  });

  it('closes only the killed session\'s browser', () => {
    const processes = spawnTwo();
    processes.kill('r1');
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

// The browser is recorded against the session id before the PTY exists. A throw from the PTY leaves
// `spawn` before the entry is in the table, so neither `kill` nor the exit path would ever reach it.
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
