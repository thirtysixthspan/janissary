import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { fakeNotificationsHost } from '../notifications/tab-test-fixture.js';
import { NotificationQueue } from '../notifications/queue.js';
import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginActivation,
  type TabPluginCapabilityName,
  type TabPluginDeclaration,
  type TabPluginResources,
  type TabPluginServerCapabilities,
} from './api.js';
import { createPluginContext } from './context.js';
import { completeCommandLine } from '../completion/index.js';

vi.mock('../completion/index.js', () => ({
  completeCommandLine: vi.fn(() => ({ matches: [], newInput: 'l', newCursor: 1 })),
}));

// The capabilities added for the shell tab: where the command came from, what a line means, what the
// bar would complete it to, and whether the terminal behind a tab is still there. Each is a narrow
// read or a single round trip through the application's own machinery, so none of them is a way to
// reach past it.
function declaration(
  capabilities: readonly TabPluginCapabilityName[],
): TabPluginDeclaration {
  return {
    id: 'shell', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: 1, tabLabelPrefix: 'shell', fileExtensions: {},
    capabilities,
  };
}

function activationFor(): TabPluginActivation {
  return { isPayload: () => true, intent: () => null, opener: { inline: () => {}, external: () => {} } };
}

function makeManagers(extra: Partial<Managers> = {}) {
  const tabs = [{ label: 'janus', dotColor: '#fff', log: [] }];
  const byLabel = vi.fn((label: string) => (label === 'janus' ? { label } : undefined));
  const managers = {
    tab: {
      tabs,
      append: vi.fn(),
      closeTab: vi.fn(),
      openPluginTab: vi.fn(),
      cur: () => tabs[0],
      launchDir: '/repo',
      cwdOf: vi.fn(() => '/repo'),
      ...fakeNotificationsHost(tabs),
      // After the fixture, because it supplies its own `byLabel` over the tab array and these cases
      // need to answer with a tab record carrying fields a bare array entry does not have.
      byLabel,
    },
    openFile: { runAs: vi.fn(async () => {}) },
    notifications: new NotificationQueue(),
    ...extra,
  } as unknown as Managers;
  return { byLabel, managers, tabs };
}

function contextFor(capabilities: readonly TabPluginCapabilityName[], managers: Managers) {
  return createPluginContext(
    managers, declaration(capabilities), activationFor(), { label: 'janus', command: 'zsh' },
    () => true, [],
  );
}

describe('originTab', () => {
  it('reports the tab a command was invoked from, with the directory it works in', () => {
    const { managers } = makeManagers();

    expect(contextFor(['originTab'], managers).originTab()).toEqual({ label: 'janus', cwd: '/repo', root: '/repo' });
  });

  it('reports the workspace clone and its offline flag when the tab has one', () => {
    const { byLabel, managers } = makeManagers();
    byLabel.mockReturnValue({ label: 'janus', workspaceDir: '/clone', offline: true } as never);

    expect(contextFor(['originTab'], managers).originTab()).toEqual({
      label: 'janus', cwd: '/repo', root: '/repo', workspace: { dir: '/clone', offline: true },
    });
  });

  it('omits the workspace entirely for a tab that has no clone', () => {
    const { byLabel, managers } = makeManagers();
    byLabel.mockReturnValue({ label: 'janus', workspaceDir: undefined, offline: false } as never);

    expect(contextFor(['originTab'], managers).originTab()?.workspace).toBeUndefined();
  });

  it('answers nothing for a tab that has gone, rather than inventing one', () => {
    const { byLabel, managers } = makeManagers();
    byLabel.mockReturnValue(undefined);
    const capabilities = createPluginContext(
      managers, declaration(['originTab']), activationFor(), { label: 'ghost', command: 'zsh' },
      () => true, [],
    );

    expect(capabilities.originTab()).toBeNull();
  });

  it('answers nothing at all once the plugin has been disabled', () => {
    const { managers } = makeManagers();
    const capabilities = createPluginContext(
      managers, declaration(['originTab']), activationFor(), { label: 'janus', command: 'zsh' },
      () => false, [],
    );

    expect(capabilities.originTab()).toBeNull();
  });
});

describe('dispatchLine', () => {
  function withDispatcher(dispatched: boolean) {
    const dispatchLine = vi.fn(() => dispatched);
    const { byLabel, managers } = makeManagers({ command: { dispatchLine } as never });
    return { byLabel, managers, dispatchLine };
  }

  it('reports a line the application claimed, having asked its own dispatcher', () => {
    const { managers, dispatchLine } = withDispatcher(true);

    expect(contextFor(['dispatchLine'], managers).dispatchLine('theme')).toBe(true);
    // With no answering tab — a command or selection action — the line runs where the plugin was
    // invoked from, which is the only tab such a call has.
    expect(dispatchLine).toHaveBeenCalledWith('janus', 'theme');
  });

  it('runs a line in the tab answering it, rather than the tab the command came from', () => {
    const { byLabel, managers, dispatchLine } = withDispatcher(true);
    byLabel.mockReturnValue({ label: 'shell1' } as never);
    const capabilities = createPluginContext(
      managers, declaration(['dispatchLine']), activationFor(), { label: 'janus', command: 'zsh' },
      () => true, [], 'shell1',
    );

    capabilities.dispatchLine('theme');

    // The user typed this into the shell tab, so this is the tab the command belongs to.
    expect(dispatchLine).toHaveBeenCalledWith('shell1', 'theme');
  });

  it('falls back to the invoking tab when the answering tab has closed', () => {
    const { byLabel, managers, dispatchLine } = withDispatcher(true);
    byLabel.mockReturnValue(undefined);
    const capabilities = createPluginContext(
      managers, declaration(['dispatchLine']), activationFor(), { label: 'janus', command: 'zsh' },
      () => true, [], 'shell1',
    );

    capabilities.dispatchLine('theme');

    // Addressing a label with no tab behind it would drop the command's output silently.
    expect(dispatchLine).toHaveBeenCalledWith('janus', 'theme');
  });

  it('reports a line nothing claimed as unclaimed, so the shell can have it', () => {
    const { managers } = withDispatcher(false);

    expect(contextFor(['dispatchLine'], managers).dispatchLine('ls -la')).toBe(false);
  });

  it('reports nothing as unclaimed once the plugin has been disabled', () => {
    const { managers } = withDispatcher(true);
    const capabilities = createPluginContext(
      managers, declaration(['dispatchLine']), activationFor(), { label: 'janus', command: 'zsh' },
      () => false, [],
    );

    expect(capabilities.dispatchLine('theme')).toBe(false);
  });
});

describe('dispatchLineWithOutput', () => {
  function withDispatcher() {
    const dispatchLineWithOutput = vi.fn(async () => ({ dispatched: true, output: 'response' }));
    const { byLabel, managers } = makeManagers({ command: { dispatchLineWithOutput } as never });
    return { byLabel, managers, dispatchLineWithOutput };
  }

  it('returns the application command output from the answering tab', async () => {
    const { byLabel, managers, dispatchLineWithOutput } = withDispatcher();
    byLabel.mockReturnValue({ label: 'shell1' } as never);
    const capabilities = createPluginContext(
      managers, declaration(['dispatchLineWithOutput']), activationFor(), { label: 'janus', command: 'zsh' },
      () => true, [], 'shell1',
    );

    await expect(capabilities.dispatchLineWithOutput('help')).resolves.toEqual({
      dispatched: true, output: 'response',
    });
    expect(dispatchLineWithOutput).toHaveBeenCalledWith('shell1', 'help');
  });

  it('returns no output after the plugin has been disabled', async () => {
    const { managers, dispatchLineWithOutput } = withDispatcher();
    const capabilities = createPluginContext(
      managers, declaration(['dispatchLineWithOutput']), activationFor(), { label: 'janus', command: 'zsh' },
      () => false, [],
    );

    await expect(capabilities.dispatchLineWithOutput('help')).resolves.toEqual({
      dispatched: false, output: '',
    });
    expect(dispatchLineWithOutput).not.toHaveBeenCalled();
  });
});

describe('spawnTerminal as a declared resource', () => {
  // The gate lives where the resources are handed over rather than in `restrictToDeclared`, which
  // walks the capability set and cannot see a resource.
  function spawnThrough(managers: Managers, spawnTerminal: boolean | undefined) {
    const seen: TabPluginResources[] = [];
    const opened = managers.tab.openPluginTab as ReturnType<typeof vi.fn>;
    opened.mockImplementation((
      _id: string, _prefix: string, _key: string, _schema: number, _source: string,
      factory: (resources: TabPluginResources) => TabPluginPayload,
    ) => { factory({ registerFile: vi.fn(), spawnTerminal: vi.fn() }); });
    const declared = {
      ...declaration(['openOrFocusTab']),
      ...(spawnTerminal !== undefined && { spawnTerminal }),
    };
    createPluginContext(
      managers, declared, activationFor(), { label: 'janus', command: 'zsh' }, () => true, [],
    ).openOrFocusTab('shell-1', (resources: TabPluginResources) => {
      seen.push(resources);
      return { title: 'shell', payload: {} };
    });
    return seen[0];
  }

  it('hands a plugin that asked for it a working spawnTerminal', () => {
    const { managers } = makeManagers();
    const resources = spawnThrough(managers, true);
    const spawn = resources.spawnTerminal as unknown as ReturnType<typeof vi.fn>;

    spawn({ cwd: '/repo', shell: '/bin/zsh', args: [] });

    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('refuses one that did not, rather than handing over a resource that does nothing', () => {
    const { managers } = makeManagers();

    const resources = spawnThrough(managers, false);

    expect(() => (resources.spawnTerminal as (o: unknown) => unknown)({ cwd: '/repo' }))
      .toThrow(/without declaring it/);
  });
});

describe('completeLine', () => {
  it('completes against the answering shell while another tab is selected', () => {
    const { managers, byLabel, tabs } = makeManagers();
    tabs.push({ label: 'shell', dotColor: '#aaa', log: [] });
    byLabel.mockImplementation((label) => tabs.find((tab) => tab.label === label));
    managers.tab.allLabels = () => tabs.map((tab) => tab.label);
    vi.mocked(managers.tab.cwdOf).mockImplementation((label) => label === 'shell' ? '/repo/clone/subdir' : '/repo');
    managers.connection = { completionConnections: vi.fn(() => []) } as unknown as Managers['connection'];
    managers.monitor = { namesFor: vi.fn(() => []) } as unknown as Managers['monitor'];
    const capabilities = createPluginContext(
      managers, declaration(['completeLine', 'originTab']), activationFor(),
      { label: 'janus', command: 'zsh' }, () => true, [], 'shell',
    );
    capabilities.completeLine('l', 1);
    expect(completeCommandLine).toHaveBeenLastCalledWith(
      'l', 1, '/repo/clone/subdir', ['janus', 'shell'], [], expect.any(Object),
    );
    expect(managers.connection.completionConnections).toHaveBeenCalledWith('shell');
    expect(capabilities.originTab()).toEqual({ label: 'shell', cwd: '/repo/clone/subdir', root: '/repo' });
  });
  it('answers with an empty result rather than calling through once the plugin has been disabled', () => {
    const { managers } = makeManagers();
    const capabilities = createPluginContext(
      managers, declaration(['completeLine']), activationFor(), { label: 'janus', command: 'zsh' },
      () => false, [],
    );

    // The line and cursor come back untouched, so a disabled plugin's bar still has something coherent
    // to show rather than a completion for text it never sent.
    expect(capabilities.completeLine('l', 1)).toEqual({ matches: [], newInput: 'l', newCursor: 1 });
  });
});

describe('terminalRunning', () => {
  // The labels the plugin's own tabs hold, which is what the answer is scoped to. A plugin tab of its
  // own is what `openPluginTab` would have minted, and what `PseudoterminalManager.adopt` re-points a
  // spawned terminal at.
  function withPluginTabs(pty: { isRunningFor: unknown }, tabs: { label: string; pluginId?: string }[]) {
    const { managers, ...rest } = makeManagers();
    (managers.tab as unknown as { tabs: unknown }).tabs = tabs.map((tab) => ({
      label: tab.label, ...(tab.pluginId && { plugin: { id: tab.pluginId, instanceKey: tab.label } }),
    }));
    Object.assign(managers, { pty });
    return { managers: managers as Managers, ...rest };
  }

  function ptyFor(running: Record<string, boolean>) {
    return {
      isRunningFor: vi.fn((ptyId: string, labels: readonly string[]) =>
        running[ptyId] === true && labels.length > 0),
    };
  }

  it('answers truthfully for a terminal one of the plugin\'s own tabs holds', () => {
    const { managers } = withPluginTabs(ptyFor({ pty7: true }), [{ label: 'shell1', pluginId: 'shell' }]);

    expect(contextFor(['terminalRunning'], managers).terminalRunning('pty7')).toBe(true);
  });

  // Pty ids come from a plain counter, so an unscoped answer lets a plugin enumerate them and learn
  // which other processes in the window are alive.
  it('refuses an id belonging to a tab of another plugin', () => {
    const { managers } = withPluginTabs(ptyFor({ pty7: true }), [{ label: 'image1', pluginId: 'image' }]);

    expect(contextFor(['terminalRunning'], managers).terminalRunning('pty7')).toBe(false);
  });

  it('answers for any of the plugin\'s own tabs, not only the most recent one', () => {
    const { managers } = withPluginTabs(ptyFor({ pty7: true }), [
      { label: 'image1', pluginId: 'image' }, { label: 'shell1', pluginId: 'shell' }, { label: 'shell2', pluginId: 'shell' },
    ]);

    expect(contextFor(['terminalRunning'], managers).terminalRunning('pty7')).toBe(true);
  });

  it('reports a terminal that has gone as not running', () => {
    const { managers } = withPluginTabs(ptyFor({}), [{ label: 'shell1', pluginId: 'shell' }]);

    expect(contextFor(['terminalRunning'], managers).terminalRunning('pty7')).toBe(false);
  });

  it('answers nothing at all once the plugin has been disabled', () => {
    const { managers } = makeManagers({ pty: { isRunningFor: vi.fn(() => true) } as never });
    const capabilities = createPluginContext(
      managers, declaration(['terminalRunning']), activationFor(), { label: 'janus', command: 'zsh' },
      () => false, [],
    );

    expect(capabilities.terminalRunning('pty7')).toBe(false);
  });
});

describe('each of them is declaration-gated', () => {
  it('refuses every one the declaration did not name', () => {
    const { managers } = makeManagers();
    const capabilities: TabPluginServerCapabilities = contextFor(['note'], managers);

    expect(() => capabilities.originTab()).toThrow('used capability "originTab" without declaring it');
    expect(() => capabilities.dispatchLine('ls')).toThrow('used capability "dispatchLine" without declaring it');
    expect(() => capabilities.dispatchLineWithOutput('help')).toThrow('used capability "dispatchLineWithOutput" without declaring it');
    expect(() => capabilities.completeLine('l', 1)).toThrow('used capability "completeLine" without declaring it');
    expect(() => capabilities.terminalRunning('pty1')).toThrow('used capability "terminalRunning" without declaring it');
  });
});
