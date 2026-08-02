import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../../managers.js';
import { availableCommands } from '../../commands.js';
import { coreCommands } from '../../commands/index.js';
import { TabManager } from '../../tab/manager.js';
import { pluginCommands } from '../server/adapters.js';
import { PluginHost } from '../server/host.js';
import { fixtureV1Manifest } from './manifest.js';
import { activate as activateFixture } from './server/activate.js';
import { isFixtureV1Payload, isFixtureV1Reply } from './shared.js';

function makeManagers(dispose: () => void): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  Object.assign(managers, {
    workspace: { remove: vi.fn(), cancel: vi.fn() },
    shell: { close: vi.fn() },
    acp: { close: vi.fn() },
    editorAcp: { closeTab: vi.fn() },
    browser: { closeTab: vi.fn() },
    pty: { closeTab: vi.fn() },
    fileNavigator: { closeTab: vi.fn() },
    editorWatch: { closeTab: vi.fn() },
    schedule: { delete: vi.fn() },
    questions: { cancelTab: vi.fn() },
    database: { forgetTab: vi.fn(), closeAll: vi.fn() },
  } as unknown as Managers);
  managers.plugins = new PluginHost(managers, {
    declarations: [fixtureV1Manifest],
    loaders: {
      'fixture-v1': async () => ({
        activate: (capabilities) => ({ ...activateFixture(capabilities), dispose }),
      }),
    },
  });
  return managers;
}

describe('frozen tab plugin API v1 fixture', () => {
  it('registers, opens, validates, round-trips an intent, and disposes acquired resources', async () => {
    const dispose = vi.fn();
    const managers = makeManagers(dispose);
    const command = pluginCommands([fixtureV1Manifest], coreCommands, availableCommands)[0];

    await command.run('fixture-tab', { label: 'janus', index: 0 }, managers);

    const tab = managers.tab.tabs.find((candidate) => candidate.plugin?.pluginId === 'fixture-v1');
    expect(tab?.view).toBe('plugin');
    expect(isFixtureV1Payload(tab?.plugin?.payload)).toBe(true);
    expect(managers.tab.openFiles.size).toBe(1);

    const reply = await managers.plugins.pluginIntent({
      tab: tab!.label, schemaVersion: 1, intent: 'echo', payload: { message: 'round trip' },
    });
    expect(isFixtureV1Reply('echo', reply.payload)).toBe(true);
    expect(reply.payload).toEqual({ message: 'round trip' });

    managers.tab.closeTab(managers.tab.tabs.findIndex((candidate) => candidate.label === tab!.label));
    expect(managers.tab.openFiles.size).toBe(0);
    await managers.plugins.dispose();
    await managers.plugins.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
