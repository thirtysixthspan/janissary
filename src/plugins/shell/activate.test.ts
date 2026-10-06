import { describe, expect, it, vi } from 'vitest';
import {
  TabPluginRejection,
  type TabPluginPayload,
  type TabPluginServerCapabilities,
} from '../api.js';
import { activate } from './activate.js';
import { SHELL_PROGRAM, isShellPayload, type ShellPayload } from './shared.js';
import { shellSetupScript } from './zsh-startup-script.js';

const startupDispose = vi.hoisted(() => vi.fn());

// A real startup directory per `activate()` would leave one in the temp directory per test; what these
// tests need is the path it hands the spawn and whether the plugin releases it.
vi.mock('./zsh-startup-directory.js', () => ({
  ZshStartupDirectory: class {
    path(): string { return '/tmp/janus-zsh-test'; }
    dispose(): void { startupDispose(); }
  },
}));

const PAYLOAD: ShellPayload = {
  instanceKey: 'shell-1', ptyId: 'pty7', cwd: '/repo', root: '/repo', workspace: false, cols: 80, rows: 24,
  connections: [], schedule: [], hookNonce: 'a'.repeat(32),
};

type Spawn = {
  cwd: string; shell?: string; args?: string[]; workspace?: { dir: string; offline?: boolean };
  env?: Record<string, string>;
};

function fakeCapabilities(overrides: {
  origin?: { label: string; cwd: string; root: string; workspace?: { dir: string; offline?: boolean }; remote?: true } | null;
  running?: boolean;
  dispatched?: boolean;
  completions?: { matches: string[]; newInput: string; newCursor: number };
} = {}) {
  const opened: { key: string; value: TabPluginPayload }[] = [];
  const updated: { key: string; payload: unknown }[] = [];
  const unreadChanges: { key: string; unread: boolean }[] = [];
  const busyChanges: { key: string; busy: boolean }[] = [];
  const spawns: Spawn[] = [];
  const origin = 'origin' in overrides ? overrides.origin : { label: 'agent1', cwd: '/repo', root: '/repo' };
  const capabilities = {
    originTab: () => origin ?? null,
    dispatchLineWithOutput: vi.fn(async () => ({
      dispatched: overrides.dispatched ?? false, output: overrides.dispatched ? 'command output' : '',
    })),
    completeLine: vi.fn(() => overrides.completions ?? { matches: [], newInput: '', newCursor: 0 }),
    terminalRunning: vi.fn(() => overrides.running ?? true),
    recordCwd: vi.fn(),
    openOrFocusTab: (key: string, factory: (resources: { spawnTerminal(options: Spawn): { ptyId: string; cols: number; rows: number } }) => TabPluginPayload) => {
      opened.push({
        key,
        value: factory({
          spawnTerminal: (options) => {
            spawns.push(options);
            return { ptyId: 'pty7', cols: 80, rows: 24 };
          },
        }),
      });
    },
    updateTab: (key: string, factory: () => { payload: unknown }) => {
      updated.push({ key, payload: factory().payload });
    },
    setUnread: (key: string, unread: boolean) => { unreadChanges.push({ key, unread }); },
    setBusy: (key: string, busy: boolean) => { busyChanges.push({ key, busy }); },
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason: unknown): never => { throw new Error(String(reason)); },
  } as unknown as TabPluginServerCapabilities;
  return { capabilities, opened, spawns, updated, unreadChanges, busyChanges };
}

// Asks the tab question the way the host does, so the guard's own verdict is what is asserted.
function ask(
  capabilities: TabPluginServerCapabilities,
  intent: string,
  payload?: unknown,
  tabPayload: ShellPayload = PAYLOAD,
) {
  return activate().intent(
    { tab: 'shell1', intent, payload, tabPayload },
    capabilities,
  );
}

describe('shell plugin activation', () => {
  it('opens a tab whose payload carries the pty id, the working directory and the spawn size', () => {
    const { capabilities, opened } = fakeCapabilities();

    activate().command?.('', capabilities);

    expect(opened).toHaveLength(1);
    expect(opened[0].value.title).toBe('shell');
    expect(opened[0].value.payload).toMatchObject({
      instanceKey: 'shell-1', ptyId: 'pty7', cwd: '/repo', root: '/repo', workspace: false, cols: 80, rows: 24,
    });
  });

  // The one invocation in the application that does not go through `shellCommandArgs`, which would
  // otherwise run a single command through the shell rather than the shell.
  it('spawns zsh itself with no argv, so the user\'s rc files load', () => {
    const { capabilities, spawns } = fakeCapabilities();

    activate().command?.('', capabilities);

    expect(spawns).toEqual([{ cwd: '/repo', shell: SHELL_PROGRAM, args: [], env: expect.any(Object) }]);
  });

  it('spawns zsh with startup files that install hooks signed with the payload\'s nonce', () => {
    const { capabilities, opened, spawns } = fakeCapabilities();

    activate().command?.('', capabilities);

    const { hookNonce } = opened[0].value.payload as ShellPayload;
    expect(hookNonce).toMatch(/^[0-9a-f]{32}$/);
    expect(spawns[0].env).toMatchObject({
      ZDOTDIR: '/tmp/janus-zsh-test',
      JANUS_SHELL_SETUP: shellSetupScript(hookNonce),
    });
  });

  it('mints a fresh nonce for every shell', () => {
    const { capabilities, opened } = fakeCapabilities();
    const activation = activate();

    activation.command?.('', capabilities);
    activation.command?.('', capabilities);

    const [first, second] = opened.map((entry) => (entry.value.payload as ShellPayload).hookNonce);
    expect(first).not.toBe(second);
  });

  it('releases the startup directory when the plugin is disposed', async () => {
    startupDispose.mockClear();

    await activate().dispose?.();

    expect(startupDispose).toHaveBeenCalledOnce();
  });

  it('gives each invocation its own tab, because a shell is stateful', () => {
    const { capabilities, opened } = fakeCapabilities();

    activate().command?.('', capabilities);
    activate().command?.('', capabilities);

    expect(opened.map((entry) => entry.key)).toHaveLength(2);
    expect(opened[0].key).not.toBe(opened[1].key);
  });

  it('starts in the workspace clone when the issuing tab has one', () => {
    const { capabilities, opened, spawns } = fakeCapabilities({
      origin: { label: 'agent1', cwd: '/clone/subdir', root: '/repo', workspace: { dir: '/clone', offline: true } },
    });

    activate().command?.('', capabilities);

    expect(spawns[0]).toEqual({
      cwd: '/clone/subdir', shell: SHELL_PROGRAM, args: [], workspace: { dir: '/clone', offline: true },
      env: expect.any(Object),
    });
    expect(opened[0].value.payload).toMatchObject({
      cwd: '/clone/subdir', root: '/repo', workspaceDir: '/clone', workspace: true,
    });
  });

  it('starts at the issuing tab\'s directory when it has no workspace', () => {
    const { capabilities, spawns } = fakeCapabilities({ origin: { label: 'harness1', cwd: '/repo/srv', root: '/repo' } });

    activate().command?.('', capabilities);

    expect(spawns[0].cwd).toBe('/repo/srv');
    expect(spawns[0].workspace).toBeUndefined();
  });

  it('opens nothing when the tab the command came from has gone', () => {
    const { capabilities, opened } = fakeCapabilities({ origin: null });

    activate().command?.('', capabilities);

    expect(opened).toHaveLength(0);
  });

  it('refuses a remote tab, whose directory is on another host, and opens nothing', () => {
    const { capabilities, opened, spawns } = fakeCapabilities({
      origin: { label: 'remote1', cwd: '/repo', root: '/repo', remote: true },
    });

    expect(() => activate().command?.('', capabilities))
      .toThrow(new TabPluginRejection('A shell tab cannot be opened from a remote tab.'));
    expect(opened).toHaveLength(0);
    expect(spawns).toHaveLength(0);
  });

  it('answers whether the terminal behind a tab is still running', () => {
    const { capabilities } = fakeCapabilities({ running: true });

    expect(ask(capabilities, 'terminal-status')).toEqual({ running: true });
  });

  it('reports a shell that exited while no browser was attached as not running', () => {
    const { capabilities } = fakeCapabilities({ running: false });

    expect(ask(capabilities, 'terminal-status', undefined)).toEqual({ running: false });
  });

  it('has no install-hooks route, since no client installs hooks any more', () => {
    const { capabilities, updated } = fakeCapabilities();

    expect(() => ask(capabilities, 'install-hooks', 'c'.repeat(32))).toThrow(TabPluginRejection);
    expect(updated).toEqual([]);
  });

  it('updates its own payload when the terminal reports a command state', () => {
    const { capabilities, updated, unreadChanges } = fakeCapabilities();

    expect(ask(capabilities, 'command-state', { running: true })).toEqual({ updated: true });
    expect(updated).toEqual([{
      key: 'shell-1', payload: { ...PAYLOAD, commandRunning: true },
    }]);
    expect(unreadChanges).toEqual([{ key: 'shell-1', unread: false }]);
  });

  it('raises unread when a previously running command finishes', () => {
    const { capabilities, unreadChanges } = fakeCapabilities();

    expect(ask(capabilities, 'command-state', { running: false }, { ...PAYLOAD, commandRunning: true }))
      .toEqual({ updated: true });
    expect(unreadChanges).toEqual([{ key: 'shell-1', unread: true }]);
  });

  it('does not raise unread for an idle status without a running-to-idle transition', () => {
    const { capabilities, unreadChanges } = fakeCapabilities();

    ask(capabilities, 'command-state', { running: false });

    expect(unreadChanges).toEqual([]);
  });

  // The tab strip's dot is host state the core reads without knowing the shell's payload shape, so
  // the shell sets it through the capability on every report, running and idle alike.
  it('sets its tab\'s busy dot from each reported command state', () => {
    const { capabilities, busyChanges } = fakeCapabilities();

    ask(capabilities, 'command-state', { running: true });
    ask(capabilities, 'command-state', { running: false }, { ...PAYLOAD, commandRunning: true });

    expect(busyChanges).toEqual([{ key: 'shell-1', busy: true }, { key: 'shell-1', busy: false }]);
  });

  it('updates its metadata directory when the terminal reports a cwd', () => {
    const { capabilities, updated } = fakeCapabilities();

    expect(ask(capabilities, 'cwd', '/repo/subdir')).toEqual({ updated: true });
    expect(updated).toEqual([{
      key: 'shell-1', payload: { ...PAYLOAD, cwd: '/repo/subdir' },
    }]);
  });

  it('records the reported cwd as its tab\'s working directory, where a sibling shell starts', () => {
    const { capabilities } = fakeCapabilities();

    ask(capabilities, 'cwd', '/repo/subdir');

    expect(capabilities.recordCwd).toHaveBeenCalledWith('/repo/subdir');
  });

  it('starts a sibling shell in the issuing shell\'s current directory', () => {
    const { capabilities, spawns } = fakeCapabilities({ origin: { label: 'shell1', cwd: '/repo/src/deep', root: '/repo' } });

    activate().command?.('', capabilities);

    expect(spawns[0].cwd).toBe('/repo/src/deep');
  });

  it('starts in the project root when the issuing shell has left it', () => {
    const { capabilities, spawns } = fakeCapabilities({ origin: { label: 'shell1', cwd: '/tmp', root: '/repo' } });

    activate().command?.('', capabilities);

    expect(spawns[0].cwd).toBe('/repo');
  });

  it('starts in the workspace clone when a workspaced shell has left the project', () => {
    const workspace = { dir: '/repo/.janissary/workspace/one', offline: false };
    const { capabilities, spawns } = fakeCapabilities({ origin: { label: 'shell1', cwd: '/repository-elsewhere', root: '/repo', workspace } });

    activate().command?.('', capabilities);

    expect(spawns[0].cwd).toBe(workspace.dir);
  });

  it('rejects a cwd that is not an absolute path', () => {
    const { capabilities } = fakeCapabilities();

    expect(() => ask(capabilities, 'cwd', 'relative/path')).toThrow(TabPluginRejection);
  });

  it('rejects a cwd carrying `..` segments and records nothing', () => {
    const { capabilities, updated } = fakeCapabilities();

    expect(() => ask(capabilities, 'cwd', '/repo/a/../../etc')).toThrow(TabPluginRejection);
    expect(capabilities.recordCwd).not.toHaveBeenCalled();
    expect(updated).toEqual([]);
  });

  it('starts in the project root when the issuing tab\'s directory only looks inside it as written', () => {
    const { capabilities, spawns } = fakeCapabilities({ origin: { label: 'shell1', cwd: '/repo/a/../../etc', root: '/repo' } });

    activate().command?.('', capabilities);

    expect(spawns[0].cwd).toBe('/repo');
  });

  it('does not treat a sibling directory whose name starts with the root\'s as inside it', () => {
    const { capabilities, spawns } = fakeCapabilities({ origin: { label: 'shell1', cwd: '/repo-evil/src', root: '/repo' } });

    activate().command?.('', capabilities);

    expect(spawns[0].cwd).toBe('/repo');
  });

  it('rejects a malformed command state', () => {
    const { capabilities } = fakeCapabilities();

    expect(() => ask(capabilities, 'command-state', { running: 'yes' })).toThrow(TabPluginRejection);
  });

  it('rejects an unknown intent name without disabling', () => {
    const { capabilities } = fakeCapabilities();

    expect(() => ask(capabilities, 'nonsense')).toThrow(TabPluginRejection);
  });

  it('rejects a payload for terminal-status that is not empty', () => {
    const { capabilities } = fakeCapabilities();

    expect(() => ask(capabilities, 'terminal-status', { running: false })).toThrow(TabPluginRejection);
  });

  it('rejects a dispatch request that is not a line', () => {
    const { capabilities } = fakeCapabilities();

    expect(() => ask(capabilities, 'dispatch', { line: 'ls' })).toThrow(TabPluginRejection);
  });

  it('reports a failure for a tab payload its own guard rejects', () => {
    const { capabilities } = fakeCapabilities();

    expect(() => activate().intent(
      { tab: 'shell1', intent: 'terminal-status', payload: undefined, tabPayload: { ptyId: 7 } },
      capabilities,
    )).toThrow(/invalid shell tab payload/);
  });

  it('offers the host\'s answer to a dispatched line', async () => {
    const { capabilities } = fakeCapabilities({ dispatched: true });

    await expect(ask(capabilities, 'dispatch', 'ls')).resolves.toEqual({ dispatched: true, output: 'command output' });
    expect(capabilities.dispatchLineWithOutput).toHaveBeenCalledWith('ls');
  });

  it('offers a line the host does not claim as undispatched, so the shell gets it', async () => {
    const { capabilities } = fakeCapabilities({ dispatched: false });

    await expect(ask(capabilities, 'dispatch', 'ls -la')).resolves.toEqual({ dispatched: false, output: '' });
  });

  it('returns the host\'s own completion for a line', () => {
    const completions = { matches: ['ls', 'lsof'], newInput: 'ls', newCursor: 2 };
    const { capabilities } = fakeCapabilities({ completions });

    expect(ask(capabilities, 'complete', { line: 'l', cursor: 1 })).toEqual(completions);
    expect(capabilities.completeLine).toHaveBeenCalledWith('l', 1);
  });

  it('rejects a completion request that does not carry a line and a cursor', () => {
    const { capabilities } = fakeCapabilities();

    expect(() => ask(capabilities, 'complete', { line: 'l' })).toThrow(TabPluginRejection);
  });

  it('queues a line on its own tab and hands back the front of that queue', () => {
    const { capabilities } = fakeCapabilities();
    const queued: string[] = [];
    Object.assign(capabilities, {
      queueLine: vi.fn((line: string) => { queued.push(line); }),
      nextQueuedLine: vi.fn(() => queued.shift() ?? null),
    });

    expect(ask(capabilities, 'queue', 'ls -la')).toEqual({ queued: true });
    expect(ask(capabilities, 'dequeue', null)).toEqual({ line: 'ls -la' });
    expect(ask(capabilities, 'dequeue', null)).toEqual({ line: null });
  });

  it('rejects a queued line that is not a string', () => {
    const { capabilities } = fakeCapabilities();

    expect(() => ask(capabilities, 'queue', { line: 'ls' })).toThrow(TabPluginRejection);
  });

  it('merges pushed host state into the tab payload without losing the terminal', () => {
    const { capabilities, updated } = fakeCapabilities();
    const rows = [{ text: 'zsh', kind: 'terminal' }];
    const schedule = [{ id: 's1', spec: 'every 1h', next: 'in 1h', recurring: true }];

    activate().hostState?.({
      instanceKey: 'shell-1',
      tabPayload: PAYLOAD,
      connections: rows,
      schedule,
    }, capabilities);

    expect(updated).toHaveLength(1);
    expect(updated[0].key).toBe('shell-1');
    expect(updated[0].payload).toEqual({ ...PAYLOAD, connections: rows, schedule });
  });

  // The rows arrive from the host, but the payload they are merged into came from this plugin, so an
  // unreadable one means something upstream produced it wrong. Writing over it would replace a payload
  // the tab still needs; there is nothing to merge into and nothing to say.
  it('writes nothing when the tab payload is not one of its own', () => {
    const { capabilities, updated } = fakeCapabilities();

    activate().hostState?.({
      instanceKey: 'shell-1', tabPayload: { ptyId: 'pty7' }, connections: [], schedule: [],
    }, capabilities);

    expect(updated).toHaveLength(0);
  });

  it('claims no files, so both openers refuse', () => {
    const { capabilities } = fakeCapabilities();
    const activation = activate();

    expect(() => activation.opener.inline('a.txt', capabilities)).toThrow(TabPluginRejection);
    expect(() => activation.opener.external('a.txt', capabilities)).toThrow(TabPluginRejection);
  });

  it('accepts a payload its own guard accepts and rejects one it does not', () => {
    expect(isShellPayload(PAYLOAD)).toBe(true);
    expect(isShellPayload({ ...PAYLOAD, ptyId: 7 })).toBe(false);
    expect(isShellPayload({ ...PAYLOAD, connections: [{ text: 'x', kind: 'nope' }] })).toBe(false);
    expect(isShellPayload([PAYLOAD])).toBe(false);
    expect(isShellPayload(null)).toBe(false);
  });
});
