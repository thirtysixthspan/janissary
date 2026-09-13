import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { TabManager } from '../tab/manager.js';
import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginActivation,
  type TabPluginDeclaration,
} from './api.js';
import { defaultMenuActionFor } from './default-menu.js';
import { TabPluginHost } from './host.js';

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
  managers.tab = new TabManager(managers);
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

describe('resolving a default-menu contribution', () => {
  it('answers the single declaration that contributes one', () => {
    expect(defaultMenuActionFor([manifest()])).toEqual({ plugin: 'fixture', label: 'Chat about this' });
  });

  it('answers nothing when no declaration contributes', () => {
    expect(defaultMenuActionFor([manifest(false)])).toBeNull();
  });

  it('answers nothing when more than one declaration contributes', () => {
    const second = { ...manifest(), id: 'second' };
    expect(defaultMenuActionFor([manifest(), second])).toBeNull();
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
