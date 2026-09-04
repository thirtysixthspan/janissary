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
  });

  it('starts no browser without the flag', () => {
    spawnHarness(false);
    expect(vi.mocked(harnessSpawnEnv)).toHaveBeenCalledWith(expect.objectContaining({ browser: false }));
    expect(vi.mocked(spawnPty).mock.calls[0]?.[7]).toBeUndefined();
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
