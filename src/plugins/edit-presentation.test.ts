import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { TabManager } from '../tab/manager.js';
import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginActivation,
  type TabPluginDeclaration,
} from './api.js';
import { TabPluginHost } from './host.js';

function manifest(claimsEdit = true): TabPluginDeclaration {
  return {
    id: 'fixture',
    version: '1.0.0',
    apiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: 1,
    tabLabelPrefix: 'fixture',
    fileExtensions: { '.fixture': 'text/plain' },
    ...(claimsEdit && { editsOwnFiles: true }),
    capabilities: ['note'],
  };
}

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
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
  return { label: managers.tab.tabs[0].label, command: 'edit /m/a.fixture' };
}

describe('the edit opener presentation', () => {
  it('runs the plugin handler for the file', async () => {
    const managers = makeManagers();
    const edit = vi.fn();
    const host = hostFor(managers, { opener: { external: () => {}, inline: () => {}, edit } });

    await host.runOpener('fixture', 'edit', '/m/a.fixture', origin(managers));

    expect(edit).toHaveBeenCalledOnce();
    expect(edit.mock.calls[0][0]).toBe('/m/a.fixture');
    expect(host.statusFor('fixture')?.state).toBe('active');
  });

  // `edit` dispatches by declaration alone, so a plugin claiming the verb with nothing behind it
  // would swallow the command before anything could discover there is no handler — caught at
  // activation, exactly as a contributed selection action with no handler is.
  it('disables a plugin that claims the verb but supplies no handler', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, {});

    await host.runOpener('fixture', 'edit', '/m/a.fixture', origin(managers));

    expect(host.statusFor('fixture')?.state).toBe('disabled');
    expect(host.statusFor('fixture')?.reason)
      .toContain('contributes "edit" but provides no edit handler');
  });

  it('activates happily when neither the declaration nor the activation carries one', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, {}, manifest(false));

    await host.runOpener('fixture', 'inline', '/m/a.fixture', origin(managers));

    expect(host.statusFor('fixture')?.state).toBe('active');
  });
});
