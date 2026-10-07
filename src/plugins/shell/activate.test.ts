import { describe, expect, it, vi } from 'vitest';
import {
  TabPluginRejection,
  type TabPluginLaunchReadyHandler,
  type TabPluginLaunchRequest,
  type TabPluginPayload,
  type TabPluginServerCapabilities,
} from '../api.js';
import { activate } from './activate.js';
import { SHELL_USAGE } from './parse-argument.js';
import { SHELL_PROGRAM, isShellPayload, type ShellPayload } from './shared.js';

const PAYLOAD: ShellPayload = {
  instanceKey: 'shell-1', ptyId: 'pty7', cwd: '/repo', root: '/repo', workspace: false, cols: 80, rows: 24,
  connections: [], schedule: [], hookNonce: 'a'.repeat(32),
};

const CLONE = '/repo/.janissary/workspace/kemal';

const PROVISIONING: ShellPayload = {
  instanceKey: 'shell-1', provisioning: true, cwd: CLONE, root: '/repo', workspaceDir: CLONE, workspace: true,
  connections: [], schedule: [], hookNonce: 'a'.repeat(32),
};

type Spawn = {
  cwd: string; shell?: string; args?: string[]; workspace?: { dir: string; offline?: boolean };
  env?: Record<string, string>; zshHooks?: { nonce: string };
};

type Launch = { key: string; request: TabPluginLaunchRequest; ready: TabPluginLaunchReadyHandler };

function fakeCapabilities(overrides: {
  origin?: { label: string; cwd: string; root: string; workspace?: { dir: string; offline?: boolean }; remote?: true } | null;
  running?: boolean;
  dispatched?: boolean;
  completions?: { matches: string[]; newInput: string; newCursor: number };
  fallbackReason?: string;
} = {}) {
  const opened: { key: string; value: TabPluginPayload }[] = [];
  const updated: { key: string; payload: unknown }[] = [];
  const unreadChanges: { key: string; unread: boolean }[] = [];
  const busyChanges: { key: string; busy: boolean }[] = [];
  const spawns: Spawn[] = [];
  const launches: Launch[] = [];
  const origin = 'origin' in overrides ? overrides.origin : { label: 'agent1', cwd: '/repo', root: '/repo' };
  const resources = {
    spawnTerminal: (options: Spawn) => {
      spawns.push(options);
      return { ptyId: 'pty7', cols: 80, rows: 24 };
    },
  };
  const capabilities = {
    originTab: () => origin ?? null,
    note: vi.fn(),
    notifyUser: vi.fn(),
    dispatchLineWithOutput: vi.fn(async () => ({
      dispatched: overrides.dispatched ?? false, output: overrides.dispatched ? 'command output' : '',
    })),
    completeLine: vi.fn(() => overrides.completions ?? { matches: [], newInput: '', newCursor: 0 }),
    terminalRunning: vi.fn(() => overrides.running ?? true),
    recordCwd: vi.fn(),
    openOrFocusTab: (key: string, factory: (given: typeof resources) => TabPluginPayload) => {
      opened.push({ key, value: factory(resources) });
    },
    // Stands in for the host: a launch with a workspace provisions `kemal`'s clone unless the case
    // says the project cannot clone, in which case it falls back and says why.
    launchTab: vi.fn((
      key: string, request: TabPluginLaunchRequest,
      factory: (given: typeof resources, start: {
        label: string; cwd: string; workspaceDir?: string; connectPtyId?: string; host?: string;
      }) => TabPluginPayload,
      ready: TabPluginLaunchReadyHandler,
    ) => {
      launches.push({ key, request, ready });
      const cloning = request.remote === undefined && request.workspace !== undefined && overrides.fallbackReason === undefined;
      const start = request.remote
        ? { label: 'kemal', cwd: '/repo/src', connectPtyId: 'ssh-pty', host: 'devbox' }
        : cloning ? { label: 'kemal', cwd: CLONE, workspaceDir: CLONE } : { label: 'kemal', cwd: '/repo/src' };
      opened.push({ key, value: factory(resources, start) });
      return {
        label: 'kemal',
        ...(request.remote === undefined && request.workspace && overrides.fallbackReason && { fallbackReason: overrides.fallbackReason }),
      };
    }),
    updateTab: (key: string, factory: (given: typeof resources) => { payload: unknown }) => {
      updated.push({ key, payload: factory(resources).payload });
    },
    setUnread: (key: string, unread: boolean) => { unreadChanges.push({ key, unread }); },
    setBusy: (key: string, busy: boolean) => { busyChanges.push({ key, busy }); },
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason: unknown): never => { throw new Error(String(reason)); },
  } as unknown as TabPluginServerCapabilities;
  return { capabilities, opened, spawns, updated, unreadChanges, busyChanges, launches };
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

describe('the zsh command', () => {
  it('launches a shell with a fresh workspace by default, holding the provisioning placeholder', () => {
    const { capabilities, opened, spawns, launches } = fakeCapabilities();

    activate().command?.('', capabilities);

    expect(launches.map((launch) => launch.request)).toEqual([{ workspace: { offline: false } }]);
    expect(spawns).toEqual([]);
    expect(opened[0].value.title).toBe('shell');
    expect(opened[0].value.payload).toMatchObject({
      instanceKey: opened[0].key, provisioning: true, cwd: CLONE, root: '/repo', workspaceDir: CLONE, workspace: true,
    });
    expect(isShellPayload(opened[0].value.payload)).toBe(true);
  });

  it('passes a typed name lowercased and the offline flag through', () => {
    const { capabilities, launches } = fakeCapabilities();

    activate().command?.('Docs Tab --OFFLINE', capabilities);

    expect(launches[0].request).toEqual({ name: 'docs tab', workspace: { offline: true } });
  });

  it('opens an unconfined shell where the host says to start with --no-workspace', () => {
    const { capabilities, opened, spawns, launches } = fakeCapabilities();

    activate().command?.('--no-workspace -w', capabilities);

    expect(launches[0].request).toEqual({});
    expect(spawns).toEqual([{ cwd: '/repo/src', shell: SHELL_PROGRAM, args: [], zshHooks: { nonce: expect.any(String) } }]);
    expect(opened[0].value.payload).toMatchObject({
      instanceKey: opened[0].key, ptyId: 'pty7', cwd: '/repo/src', root: '/repo', workspace: false, cols: 80, rows: 24,
    });
  });

  it('asks the host for zsh hooks signed with the payload\'s nonce rather than building ZDOTDIR itself', () => {
    const { capabilities, opened, spawns } = fakeCapabilities();

    activate().command?.('--no-workspace', capabilities);

    const { hookNonce } = opened[0].value.payload as ShellPayload;
    expect(hookNonce).toMatch(/^[0-9a-f]{32}$/);
    expect(spawns[0].zshHooks).toEqual({ nonce: hookNonce });
    expect(spawns[0].env).toBeUndefined();
  });

  it('mints a fresh nonce and instance key for every shell, because a shell is stateful', () => {
    const { capabilities, opened } = fakeCapabilities();
    const activation = activate();

    activation.command?.('', capabilities);
    activation.command?.('', capabilities);

    const [first, second] = opened.map((entry) => (entry.value.payload as ShellPayload).hookNonce);
    expect(first).not.toBe(second);
    expect(opened[0].key).not.toBe(opened[1].key);
  });

  it('replies when the project cannot clone and the shell opened without a workspace', () => {
    const { capabilities, spawns } = fakeCapabilities({ fallbackReason: 'no git repository found' });

    activate().command?.('', capabilities);

    expect(spawns[0].workspace).toBeUndefined();
    expect(capabilities.note).toHaveBeenCalledWith('Shell "kemal" has no workspace: no git repository found.');
  });

  it('says nothing for a launch that did not ask for a workspace', () => {
    const { capabilities } = fakeCapabilities({ fallbackReason: 'no git repository found' });

    activate().command?.('--no-workspace', capabilities);

    expect(capabilities.note).not.toHaveBeenCalled();
  });

  it('refuses an unknown option with the usage line, launching nothing', () => {
    const { capabilities, launches } = fakeCapabilities();

    expect(() => activate().command?.('docs --bogus', capabilities))
      .toThrow(new TabPluginRejection(`Unknown option "--bogus". ${SHELL_USAGE}`));
    expect(launches).toHaveLength(0);
  });

  it('routes a remote launch with its SSH PTY rendered during provisioning', () => {
    const { capabilities, launches, opened } = fakeCapabilities();

    activate().command?.('Docs on DevBox --offline', capabilities);

    expect(launches[0]?.request).toEqual({
      name: 'docs', workspace: { offline: true }, remote: { address: 'DevBox' },
    });
    expect(opened[0]?.value.payload).toMatchObject({
      provisioning: true, workspace: true, connectPtyId: 'ssh-pty', host: 'devbox',
    });
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

  it('refuses a nested remote launch with its specific message', () => {
    const { capabilities, launches } = fakeCapabilities({
      origin: { label: 'remote1', cwd: '/repo', root: '/repo', remote: true },
    });

    expect(() => activate().command?.('docs on devbox', capabilities))
      .toThrow(new TabPluginRejection('Cannot launch a remote shell from a remote tab.'));
    expect(launches).toHaveLength(0);
  });

  it('starts zsh confined to the clone at its root once the clone lands, and announces it', async () => {
    const { capabilities, launches, spawns, updated, opened } = fakeCapabilities();
    activate().command?.('--offline', capabilities);

    await launches[0].ready({
      instanceKey: 'shell-1', workspaceDir: CLONE, displayDir: '.janissary/workspace/kemal',
      sandboxNotice: 'workspace isolation off: sandbox-exec unavailable',
    }, capabilities);

    expect(spawns).toEqual([{
      cwd: CLONE, shell: SHELL_PROGRAM, args: [], workspace: { dir: CLONE, offline: true }, zshHooks: { nonce: expect.any(String) },
    }]);
    expect(updated[0]).toMatchObject({
      key: 'shell-1',
      payload: {
        ptyId: 'pty7', cwd: CLONE, workspaceDir: CLONE, workspace: true,
        hookNonce: (opened[0].value.payload as ShellPayload).hookNonce,
      },
    });
    expect(isShellPayload(updated[0].payload)).toBe(true);
    expect(capabilities.notifyUser).toHaveBeenCalledWith(
      'Shell "kemal" ready. (workspace: .janissary/workspace/kemal)', { tab: 'shell-1' },
    );
    expect(capabilities.notifyUser).toHaveBeenCalledWith(
      'workspace isolation off: sandbox-exec unavailable', { tab: 'shell-1' },
    );
  });

  it('starts a remote zsh at the remote workspace and announces the host', async () => {
    const { capabilities, launches, spawns, updated } = fakeCapabilities();
    activate().command?.('docs on devbox', capabilities);

    await launches[0].ready({
      instanceKey: 'shell-1', workspaceDir: '/remote/project', displayDir: '/remote/project', host: 'devbox',
    }, capabilities);

    expect(spawns).toEqual([{
      cwd: '/remote/project', shell: SHELL_PROGRAM, args: [],
      workspace: { dir: '/remote/project', offline: false }, zshHooks: { nonce: expect.any(String) },
    }]);
    expect(updated[0]?.payload).toMatchObject({ host: 'devbox', prompted: false, workspaceDir: '/remote/project' });
    expect(capabilities.notifyUser).toHaveBeenCalledWith(
      'Shell "kemal" ready on devbox. (workspace: /remote/project)', { tab: 'shell-1' },
    );
  });
});

describe('the sibling intent', () => {
  it('opens nothing beside a shell still waiting for its workspace', () => {
    const { capabilities, opened } = fakeCapabilities();

    expect(ask(capabilities, 'sibling', null, PROVISIONING)).toEqual({ opened: false });
    expect(opened).toHaveLength(0);
  });

  it('opens an unconfined shell beside an unconfined one, in its directory', () => {
    const { capabilities, opened, spawns } = fakeCapabilities({ origin: { label: 'shell1', cwd: '/repo/src/deep', root: '/repo' } });

    expect(ask(capabilities, 'sibling', null)).toEqual({ opened: true });
    expect(spawns[0]).toEqual({ cwd: '/repo/src/deep', shell: SHELL_PROGRAM, args: [], zshHooks: { nonce: expect.any(String) } });
    expect(opened[0].value.payload).toMatchObject({ workspace: false });
  });

  it('confines a sibling of a workspaced shell to the same clone and offline mode', () => {
    const { capabilities, opened, spawns } = fakeCapabilities({
      origin: { label: 'shell1', cwd: '/clone/subdir', root: '/repo', workspace: { dir: '/clone', offline: true } },
    });

    ask(capabilities, 'sibling', null);

    expect(spawns[0]).toEqual({
      cwd: '/clone/subdir', shell: SHELL_PROGRAM, args: [], workspace: { dir: '/clone', offline: true },
      zshHooks: { nonce: expect.any(String) },
    });
    expect(opened[0].value.payload).toMatchObject({
      cwd: '/clone/subdir', root: '/repo', workspaceDir: '/clone', workspace: true,
    });
  });

  it('starts in the project root when the issuing shell has left it', () => {
    const { capabilities, spawns } = fakeCapabilities({ origin: { label: 'shell1', cwd: '/tmp', root: '/repo' } });

    ask(capabilities, 'sibling', null);

    expect(spawns[0].cwd).toBe('/repo');
  });

  it('starts in the workspace clone when a workspaced shell has left the project', () => {
    const workspace = { dir: '/repo/.janissary/workspace/one', offline: false };
    const { capabilities, spawns } = fakeCapabilities({ origin: { label: 'shell1', cwd: '/repository-elsewhere', root: '/repo', workspace } });

    ask(capabilities, 'sibling', null);

    expect(spawns[0].cwd).toBe(workspace.dir);
  });

  it('starts in the project root when the issuing tab\'s directory only looks inside it as written', () => {
    const { capabilities, spawns } = fakeCapabilities({ origin: { label: 'shell1', cwd: '/repo/a/../../etc', root: '/repo' } });

    ask(capabilities, 'sibling', null);

    expect(spawns[0].cwd).toBe('/repo');
  });

  it('does not treat a sibling directory whose name starts with the root\'s as inside it', () => {
    const { capabilities, spawns } = fakeCapabilities({ origin: { label: 'shell1', cwd: '/repo-evil/src', root: '/repo' } });

    ask(capabilities, 'sibling', null);

    expect(spawns[0].cwd).toBe('/repo');
  });

  it('rejects a payload that is not empty', () => {
    const { capabilities } = fakeCapabilities();

    expect(() => ask(capabilities, 'sibling', { open: true })).toThrow(TabPluginRejection);
  });
});

describe('shell plugin activation', () => {
  it('owns no startup directory, so it has nothing to release on dispose', () => {
    expect(activate().dispose).toBeUndefined();
  });

  it('answers whether the terminal behind a tab is still running', () => {
    const { capabilities } = fakeCapabilities({ running: true });

    expect(ask(capabilities, 'terminal-status')).toEqual({ running: true });
  });

  it('reports a shell that exited while no browser was attached as not running', () => {
    const { capabilities } = fakeCapabilities({ running: false });

    expect(ask(capabilities, 'terminal-status', undefined)).toEqual({ running: false });
  });

  it('answers running for a shell still waiting for its workspace, which has no terminal to ask about', () => {
    const { capabilities } = fakeCapabilities({ running: false });

    expect(ask(capabilities, 'terminal-status', null, PROVISIONING)).toEqual({ running: true });
    expect(capabilities.terminalRunning).not.toHaveBeenCalled();
  });

  it('reports a remote shell that exits before its first prompt, but not after cwd was reported', () => {
    const { capabilities } = fakeCapabilities({ origin: { label: 'shell-tab', cwd: '/repo', root: '/repo' } });
    const remote = { ...PAYLOAD, host: 'devbox', prompted: false };

    expect(ask(capabilities, 'exited-early', null, remote)).toEqual({ reported: true });
    expect(capabilities.notifyUser).toHaveBeenCalledWith(
      'Failed to start "shell-tab" on devbox: zsh exited before its first prompt.', { tab: 'shell-1' },
    );
    expect(ask(capabilities, 'exited-early', null, { ...remote, prompted: true })).toEqual({ reported: false });
    expect(capabilities.notifyUser).toHaveBeenCalledTimes(1);
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

  it('marks the remote shell prompted on its first cwd report', () => {
    const { capabilities, updated } = fakeCapabilities();

    ask(capabilities, 'cwd', '/remote/project', { ...PAYLOAD, host: 'devbox', prompted: false });

    expect(updated[0]?.payload).toMatchObject({ cwd: '/remote/project', host: 'devbox', prompted: true });
  });

  it('records the reported cwd as its tab\'s working directory, where a sibling shell starts', () => {
    const { capabilities } = fakeCapabilities();

    ask(capabilities, 'cwd', '/repo/subdir');

    expect(capabilities.recordCwd).toHaveBeenCalledWith('/repo/subdir');
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
    expect(isShellPayload(PROVISIONING)).toBe(true);
    expect(isShellPayload({ ...PAYLOAD, ptyId: 7 })).toBe(false);
    expect(isShellPayload({ ...PAYLOAD, connections: [{ text: 'x', kind: 'nope' }] })).toBe(false);
    expect(isShellPayload([PAYLOAD])).toBe(false);
    expect(isShellPayload(null)).toBe(false);
  });
});
