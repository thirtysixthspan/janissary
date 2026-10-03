import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { fakeNotificationsHost } from '../notifications/tab-test-fixture.js';
import { NotificationQueue } from '../notifications/queue.js';
import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginActivation,
  type TabPluginCapabilityName,
  type TabPluginDeclaration,
  type TabPluginServerCapabilities,
} from './api.js';
import { createPluginContext } from './context.js';

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

    expect(contextFor(['originTab'], managers).originTab()).toEqual({ label: 'janus', cwd: '/repo' });
  });

  it('reports the workspace clone and its offline flag when the tab has one', () => {
    const { byLabel, managers } = makeManagers();
    byLabel.mockReturnValue({ label: 'janus', workspaceDir: '/clone', offline: true } as never);

    expect(contextFor(['originTab'], managers).originTab()).toEqual({
      label: 'janus', cwd: '/repo', workspace: { dir: '/clone', offline: true },
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

describe('completeLine', () => {
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
  it('asks the pty manager, which is the only thing that knows', () => {
    const isRunning = vi.fn(() => true);
    const { managers } = makeManagers({ pty: { isRunning } as never });

    expect(contextFor(['terminalRunning'], managers).terminalRunning('pty7')).toBe(true);
    expect(isRunning).toHaveBeenCalledWith('pty7');
  });

  it('reports a terminal that has gone as not running', () => {
    const { managers } = makeManagers({ pty: { isRunning: vi.fn(() => false) } as never });

    expect(contextFor(['terminalRunning'], managers).terminalRunning('pty7')).toBe(false);
  });
});

describe('each of them is declaration-gated', () => {
  it('refuses every one the declaration did not name', () => {
    const { managers } = makeManagers();
    const capabilities: TabPluginServerCapabilities = contextFor(['note'], managers);

    expect(() => capabilities.originTab()).toThrow('used capability "originTab" without declaring it');
    expect(() => capabilities.dispatchLine('ls')).toThrow('used capability "dispatchLine" without declaring it');
    expect(() => capabilities.completeLine('l', 1)).toThrow('used capability "completeLine" without declaring it');
    expect(() => capabilities.terminalRunning('pty1')).toThrow('used capability "terminalRunning" without declaring it');
  });
});