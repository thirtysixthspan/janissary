import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { TabManager } from '../tab/manager.js';
import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginActivation,
  type TabPluginDeclaration,
} from './api.js';
import { defaultMenuActionsFor } from './default-menu.js';
import { TabPluginHost } from './host.js';
import { NotificationQueue } from '../notifications/queue.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';

function manifest(contributed = true): TabPluginDeclaration {
  return {
    id: 'fixture',
    version: '1.0.0',
    apiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: 1,
    tabLabelPrefix: 'fixture',
    fileExtensions: {},
    ...(contributed && { defaultMenu: { label: 'Chat about this' } }),
    capabilities: ['note'],
  };
}

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.notifications = new NotificationQueue();
  managers.tab = new TabManager(managers);
  seedRootTab(managers.tab);
  Object.assign(managers, {} as unknown as Managers);
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
  return { label: managers.tab.tabs[0].label, command: 'Chat about this' };
}

function contributor(id: string, defaultMenu: TabPluginDeclaration['defaultMenu']): TabPluginDeclaration {
  return { ...manifest(false), id, defaultMenu };
}

describe('resolving default-menu contributions', () => {
  it('answers the single declaration that contributes one', () => {
    expect(defaultMenuActionsFor([manifest()])).toEqual([{ plugin: 'fixture', label: 'Chat about this' }]);
  });

  it('answers nothing when no declaration contributes', () => {
    expect(defaultMenuActionsFor([manifest(false)])).toEqual([]);
  });

  it('answers every contribution, ordered by its declared order rather than catalog order', () => {
    const chat = contributor('chat', { label: 'Chat about this', order: 2, shortcut: true });
    const search = contributor('search', { label: 'Search for this', order: 1 });
    expect(defaultMenuActionsFor([chat, manifest(false), search])).toEqual([
      { plugin: 'search', label: 'Search for this' },
      { plugin: 'chat', label: 'Chat about this', shortcut: true },
    ]);
  });

  it('keeps catalog order between contributions with the same order', () => {
    const first = contributor('first', { label: 'First' });
    const second = contributor('second', { label: 'Second' });
    expect(defaultMenuActionsFor([first, second]).map((entry) => entry.plugin)).toEqual(['first', 'second']);
  });

  it('offers a label more than one declaration contributes from none of them', () => {
    const second = { ...manifest(), id: 'second' };
    const search = contributor('search', { label: 'Search for this' });
    expect(defaultMenuActionsFor([manifest(), second, search])).toEqual([
      { plugin: 'search', label: 'Search for this' },
    ]);
  });

  it('gives the shortcut to no entry when more than one claims it', () => {
    const chat = contributor('chat', { label: 'Chat about this', shortcut: true });
    const search = contributor('search', { label: 'Search for this', shortcut: true });
    expect(defaultMenuActionsFor([chat, search])).toEqual([
      { plugin: 'chat', label: 'Chat about this' },
      { plugin: 'search', label: 'Search for this' },
    ]);
  });
});

describe('running a contributed default-menu action', () => {
  it('hands the selection text to the plugin handler', async () => {
    const managers = makeManagers();
    const defaultMenuAction = vi.fn();
    const host = hostFor(managers, { defaultMenuAction });

    await host.runDefaultMenuAction('fixture', 'Chat about this', 'selected text', origin(managers));

    expect(defaultMenuAction).toHaveBeenCalledOnce();
    expect(defaultMenuAction.mock.calls[0][0]).toBe('selected text');
  });

  it('rejects a label the declaration does not carry without disabling the plugin', async () => {
    const managers = makeManagers();
    const defaultMenuAction = vi.fn();
    const host = hostFor(managers, { defaultMenuAction });

    await host.runDefaultMenuAction('fixture', 'Ask about this', 'selected text', origin(managers));

    expect(defaultMenuAction).not.toHaveBeenCalled();
    expect(host.statusFor('fixture')?.state).toBe('active');
    expect(managers.tab.tabs[0].log.at(-1)?.output)
      .toContain('contributes no default-menu action "Ask about this"');
  });

  it('disables a plugin whose declaration contributes an entry with no handler', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, {});

    await host.runDefaultMenuAction('fixture', 'Chat about this', 'selected text', origin(managers));

    expect(host.statusFor('fixture')?.state).toBe('disabled');
    expect(host.statusFor('fixture')?.reason)
      .toContain('contributes "Chat about this" but provides no handler');
  });

  it('disables the plugin when its handler throws', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, {
      defaultMenuAction: () => { throw new Error('handler broke'); },
    });

    await host.runDefaultMenuAction('fixture', 'Chat about this', 'selected text', origin(managers));

    expect(host.statusFor('fixture')?.state).toBe('disabled');
    expect(host.statusFor('fixture')?.reason).toContain('handler broke');
  });

  it('does nothing at all for a plugin id the host does not hold', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, { defaultMenuAction: vi.fn() });

    await expect(
      host.runDefaultMenuAction('nobody', 'Chat about this', 'selected text', origin(managers)),
    ).resolves.toBeUndefined();
  });
});
