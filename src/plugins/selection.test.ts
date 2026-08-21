import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { TabManager } from '../tab/manager.js';
import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginActivation,
  type TabPluginDeclaration,
} from './api.js';
import { TabPluginHost } from './host.js';

function manifest(contributed = true): TabPluginDeclaration {
  return {
    id: 'fixture',
    version: '1.0.0',
    apiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: 1,
    tabLabelPrefix: 'fixture',
    fileExtensions: { '.fixture': 'text/plain' },
    ...(contributed && { selectionAction: { label: 'Add to playlist', action: 'queue' } }),
    capabilities: ['openClaimedFiles', 'note'],
  };
}

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  Object.assign(managers, {
    openFile: { runAs: vi.fn(async () => {}) },
  } as unknown as Managers);
  return managers;
}

function hostFor(
  managers: Managers,
  activation: Partial<TabPluginActivation>,
  declaration: TabPluginDeclaration = manifest(),
): TabPluginHost {
  return new TabPluginHost(managers, [declaration], {
    fixture: async () => ({
      activate: () => ({
        isPayload: () => true,
        intent: () => null,
        opener: { external: () => {}, inline: () => {} },
        ...activation,
      }),
    }),
  });
}

function origin(managers: Managers) {
  return { label: managers.tab.tabs[0].label, command: 'Add to playlist' };
}

describe('running a contributed selection action', () => {
  it('hands the resolved absolute paths to the plugin handler', async () => {
    const managers = makeManagers();
    const selectionAction = vi.fn();
    const host = hostFor(managers, { selectionAction });

    await host.runSelectionAction('fixture', 'queue', ['/m/a.fixture', '/m/b.fixture'], origin(managers));

    expect(selectionAction).toHaveBeenCalledOnce();
    expect(selectionAction.mock.calls[0][0]).toEqual(['/m/a.fixture', '/m/b.fixture']);
  });

  it('runs every openClaimedFiles target the handler queued, pinned to its own opener', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, {
      selectionAction: (paths, capabilities) => {
        for (const file of paths) capabilities.openClaimedFiles(file);
      },
    });

    await host.runSelectionAction('fixture', 'queue', ['/m/a.fixture'], origin(managers));

    expect(managers.openFile.runAs).toHaveBeenCalledWith(
      'open /m/a.fixture', 'Add to playlist', managers.tab.tabs[0].label, 'fixture',
    );
  });

  // The label is drawn from the declaration alone, so an entry with nothing behind it would reach
  // the user before anything could discover it does not run — caught at activation instead.
  it('disables a plugin whose declaration contributes an entry with no handler', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, {});

    await host.runSelectionAction('fixture', 'queue', ['/m/a.fixture'], origin(managers));

    expect(host.statusFor('fixture')?.state).toBe('disabled');
    expect(host.statusFor('fixture')?.reason)
      .toContain('contributes "Add to playlist" but provides no selectionAction handler');
  });

  it('activates happily when neither the declaration nor the activation carries one', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, {}, manifest(false));

    await host.runOpener('fixture', 'inline', '/m/a.fixture', origin(managers));

    expect(host.statusFor('fixture')?.state).toBe('active');
  });

  // A rejection answers one bad request and leaves the plugin running; there is no waiting client,
  // so it lands in the transcript of the tab the menu was opened from.
  it('rejects an action name the declaration does not carry without disabling the plugin', async () => {
    const managers = makeManagers();
    const selectionAction = vi.fn();
    const host = hostFor(managers, { selectionAction });

    await host.runSelectionAction('fixture', 'shuffle', ['/m/a.fixture'], origin(managers));

    expect(selectionAction).not.toHaveBeenCalled();
    expect(host.statusFor('fixture')?.state).toBe('active');
    expect(managers.tab.tabs[0].log.at(-1)?.output)
      .toContain('contributes no selection action "shuffle"');
  });

  it('disables the plugin when its handler throws', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, {
      selectionAction: () => { throw new Error('handler broke'); },
    });

    await host.runSelectionAction('fixture', 'queue', ['/m/a.fixture'], origin(managers));

    expect(host.statusFor('fixture')?.state).toBe('disabled');
    expect(host.statusFor('fixture')?.reason).toContain('handler broke');
  });

  it('does nothing at all for a plugin id the host does not hold', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, { selectionAction: vi.fn() });

    await expect(host.runSelectionAction('nobody', 'queue', ['/m/a.fixture'], origin(managers)))
      .resolves.toBeUndefined();
  });
});
