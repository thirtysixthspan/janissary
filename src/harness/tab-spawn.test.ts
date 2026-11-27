import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { byLabel, harnessTab } from '../tab/lookup.js';
import { HarnessManager } from './manager.js';
import { TerminalRuntimeManager } from '../terminal-runtime/manager.js';

const MCP = { url: 'http://127.0.0.1:51234/mcp', token: 'tok-123' };
const terminalRuntimeManagers: TerminalRuntimeManager[] = [];
type RemoteHandlers = { onReady: (dir: string, notice?: string) => void };
type SpawnEnvOptions = {
  name: string; cwd: string; label: string; browser: boolean;
  mcp?: { url: string; token: string };
  onBrowserGone: (message: string, log?: string) => void;
};

const mocks = vi.hoisted(() => ({ spawnEnvCalls: [] as SpawnEnvOptions[] }));

vi.mock('./scratch-dir.js', () => ({
  claudeTmpDir: vi.fn((cwd: string) => `${cwd}/.janissary/temp`),
  harnessEnv: vi.fn((name: string, cwd: string) => (name === 'claude'
    ? { CLAUDE_CODE_TMPDIR: `${cwd}/.janissary/temp`, DISABLE_AUTOUPDATER: '1' }
    : undefined)),
  harnessSpawnEnv: vi.fn((options: SpawnEnvOptions) => {
    mocks.spawnEnvCalls.push(options);
    const base = options.name === 'claude'
      ? { CLAUDE_CODE_TMPDIR: `${options.cwd}/.janissary/temp`, DISABLE_AUTOUPDATER: '1' }
      : undefined;
    const mcp = options.mcp && {
      JANISSARY_TAB: options.label,
      JANISSARY_MCP_URL: options.mcp.url,
      JANISSARY_MCP_TOKEN: options.mcp.token,
    };
    if (!options.browser) return { env: { ...base, ...mcp } };
    return {
      env: {
        ...base,
        JANISSARY_BROWSER_WS_ENDPOINT: 'ws://127.0.0.1:50000/tok',
        JANISSARY_PLAYWRIGHT: '/pw/index.js',
        ...mcp,
      },
      handle: { close: vi.fn() },
    };
  }),
}));
vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));
vi.mock('../browser/browser-log.js', () => ({ writeBrowserLog: vi.fn() }));
vi.mock('../launch-name/leftover.js', () => ({
  isWorkspaceRunning: vi.fn(() => false),
  hasLeftoverWorkspace: vi.fn(() => false),
  removeLeftoverWorkspace: vi.fn(),
}));
vi.mock('./recorder.js', () => ({
  HarnessRecorder: vi.fn(function () { return { dispose: vi.fn() }; }),
}));
vi.mock('./transcript/tailer.js', () => ({
  HarnessTranscriptTailer: vi.fn(function () {
    return { dispose: vi.fn(), transcriptFile: vi.fn(), entriesAfter: vi.fn(() => []) };
  }),
}));

function makeManagers(): { managers: Managers; tabs: Tab[] } {
  const tabs = [{ label: 'janus', log: [] } as unknown as Tab];
  const creator = tabs[0];
  const busy = new Set<string>();
  const managers = {
    tab: {
      tabs,
      cur: () => creator,
      allLabels: () => tabs.map((tab) => tab.label),
      cwdOf: () => '/project',
      setCwd: () => {},
      insertTabInGroup: (tab: Tab) => { tabs.push(tab); },
      isBusy: (label: string) => busy.has(label),
      addBusy: vi.fn((label: string) => { busy.add(label); }),
      deleteBusy: vi.fn((label: string) => { busy.delete(label); }),
      markUnread: vi.fn(),
      findIndex: () => tabs.length - 1,
      harnessTab: (label: string) => harnessTab(tabs, label),
      byLabel: (label: string) => byLabel(tabs, label),
      setActiveTab: vi.fn(),
      append: vi.fn(),
      closeTab: vi.fn(),
    },
    pty: { spawn: vi.fn(() => 'pty-1'), spawnDimensions: () => ({ cols: 80, rows: 24 }), input: vi.fn() },
    terminalRuntime: { install: vi.fn() },
    workspace: { create: () => ({ dir: '/workspace/claude' }) },
    openFile: { edit: vi.fn() },
    schedule: { set: vi.fn() },
    sessions: { view: vi.fn(() => []) },
  } as unknown as Managers;
  const terminalRuntime = new TerminalRuntimeManager(managers);
  terminalRuntimeManagers.push(terminalRuntime);
  Object.assign(managers, { terminalRuntime });
  return { managers, tabs };
}

function withMcp(managers: Managers, launch: typeof MCP | undefined): Managers {
  (managers as unknown as { mcp: { localLaunch: () => typeof MCP | undefined } }).mcp = {
    localLaunch: () => launch,
  };
  return managers;
}

function spawnArgs(managers: Managers): unknown[] {
  return (managers.pty.spawn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
}

function remoteManagers(managers: Managers): { registerRemotePty: ReturnType<typeof vi.fn>; ready: (cwd: string) => void } {
  const channel = { ptyId: 'ssh-pty-1', attached: true, send: vi.fn() };
  let handlers: RemoteHandlers | undefined;
  const registerRemotePty = vi.fn(() => 'rpty1');
  (managers.pty as unknown as { registerRemotePty: unknown }).registerRemotePty = registerRemotePty;
  (managers as unknown as { remote: unknown }).remote = {
    create: vi.fn((_label: string, _address: unknown, _cwd: string, next: RemoteHandlers) => {
      handlers = next;
      return channel;
    }),
    get: vi.fn(() => channel),
    transcriptSource: vi.fn(() => ({ poll: () => [], resolved: () => false })),
  };
  return { registerRemotePty, ready: (cwd) => handlers!.onReady(cwd) };
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.spawnEnvCalls.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  for (const manager of terminalRuntimeManagers) manager.dispose();
  terminalRuntimeManagers.length = 0;
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('HarnessTabSpawn MCP environment', () => {
  it('injects the three variables and the command fragment on a local launch', () => {
    const { managers, tabs } = makeManagers();
    withMcp(managers, MCP);
    expect(new HarnessManager(managers).run('harness claude --no-workspace --no-browser')).toBeUndefined();
    const args = spawnArgs(managers);
    expect(args[6]).toMatchObject({
      JANISSARY_TAB: 'claude', JANISSARY_MCP_URL: MCP.url, JANISSARY_MCP_TOKEN: MCP.token,
    });
    expect(args[2]).toContain('--mcp-config');
    expect(tabs.at(-1)).toMatchObject({ mcp: true });
  });

  it('passes no MCP variables or fragment with --no-mcp', () => {
    const { managers, tabs } = makeManagers();
    withMcp(managers, MCP);
    expect(new HarnessManager(managers).run('harness claude --no-workspace --no-browser --no-mcp')).toBeUndefined();
    const args = spawnArgs(managers);
    expect(args[6]).toEqual({ CLAUDE_CODE_TMPDIR: '/project/.janissary/temp', DISABLE_AUTOUPDATER: '1' });
    expect(args[2]).not.toContain('--mcp-config');
    expect(tabs.at(-1)).toMatchObject({ mcp: false });
  });

  it('passes no MCP variables or fragment with --offline', () => {
    const { managers } = makeManagers();
    withMcp(managers, MCP);
    expect(new HarnessManager(managers).run('harness claude --no-workspace --no-browser --offline')).toBeUndefined();
    const args = spawnArgs(managers);
    expect(args[6]).toEqual({ CLAUDE_CODE_TMPDIR: '/project/.janissary/temp', DISABLE_AUTOUPDATER: '1' });
    expect(args[2]).not.toContain('--mcp-config');
  });

  it('passes no MCP variables or fragment while the local server is down', () => {
    const { managers } = makeManagers();
    withMcp(managers, undefined);
    expect(new HarnessManager(managers).run('harness claude --no-workspace --no-browser')).toBeUndefined();
    const args = spawnArgs(managers);
    expect(args[6]).toEqual({ CLAUDE_CODE_TMPDIR: '/project/.janissary/temp', DISABLE_AUTOUPDATER: '1' });
    expect(args[2]).not.toContain('--mcp-config');
  });

  it('builds no local MCP variables for a remote launch', async () => {
    const { managers } = makeManagers();
    withMcp(managers, MCP);
    const { registerRemotePty, ready } = remoteManagers(managers);
    expect(new HarnessManager(managers).run('harness claude on devbox --no-browser')).toBeUndefined();
    ready('/srv/ws');
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.spawnEnvCalls).toHaveLength(0);
    const args = (registerRemotePty as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(args[2]).toMatchObject({ command: expect.stringContaining('--mcp-config'), harness: 'claude' });
  });
});
