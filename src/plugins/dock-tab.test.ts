import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { TabManager } from '../tab/manager.js';
import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginCapabilityName,
  type TabPluginDeclaration,
} from './api.js';
import { TabPluginHost } from './host.js';

function manifest(
  id: string,
  capabilities: readonly TabPluginCapabilityName[] = ['openOrFocusTab', 'dockTab'],
): TabPluginDeclaration {
  return {
    id, version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION, payloadSchemaVersion: 1,
    tabLabelPrefix: id, fileExtensions: { [`.${id}`]: 'text/plain' }, capabilities,
  };
}

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  Object.assign(managers, {
    workspace: { remove: vi.fn(), cancel: vi.fn() },
    shell: { close: vi.fn() },
    acp: { close: vi.fn() },
    browser: { closeTab: vi.fn() },
    pty: { closeTab: vi.fn() },
    fileNavigator: { closeTab: vi.fn() },
    editorWatch: { closeTab: vi.fn(), watch: vi.fn() },
    editorAcp: { closeTab: vi.fn() },
    schedule: { delete: vi.fn() },
    questions: { cancelTab: vi.fn(), pendingFor: vi.fn() },
    database: { forgetTab: vi.fn(), closeAll: vi.fn() },
  } as unknown as Managers);
  return managers;
}

// One plugin whose opener opens a tab keyed by the file it was given, and whose intent docks the
// instance key it was handed to the side carried in the intent name.
function hostFor(
  managers: Managers,
  declarations: TabPluginDeclaration[] = [manifest('fixture')],
): TabPluginHost {
  const loaders = Object.fromEntries(declarations.map((declaration) => [declaration.id, async () => ({
    activate: () => ({
      isPayload: () => true,
      opener: {
        external: () => {},
        inline: (file: string, capabilities) => {
          capabilities.openOrFocusTab(file, () => ({ title: declaration.id, payload: { file } }));
        },
      },
      intent: (request, capabilities) => {
        const dock = request.intent === 'centre' ? null : request.intent as 'left' | 'right';
        capabilities.dockTab(String(request.payload), dock);
        return null;
      },
    }),
  })]));
  return new TabPluginHost(managers, declarations, loaders);
}

async function openTab(host: TabPluginHost, managers: Managers, id = 'fixture', file = '/tmp/a.fixture') {
  await host.runOpener(id, 'inline', file, { label: managers.tab.tabs[0].label, command: `open ${file}` });
  return managers.tab.tabs.find((tab) => tab.plugin?.id === id)!;
}

describe('dockTab', () => {
  it('docks one of the plugin\'s own tabs into the named sidebar', async () => {
    const managers = makeManagers();
    const host = hostFor(managers);
    const tab = await openTab(host, managers);

    await host.intent(tab.label, 'right', '/tmp/a.fixture');

    expect(tab.dock).toBe('right');
  });

  // `null` is what bare `schedules` does to a docked list: back to the centre strip, and active.
  it('undocks back to the centre strip and makes the tab active', async () => {
    const managers = makeManagers();
    const host = hostFor(managers);
    const tab = await openTab(host, managers);
    await host.intent(tab.label, 'left', '/tmp/a.fixture');

    await host.intent(tab.label, 'centre', '/tmp/a.fixture');

    expect(tab.dock).toBeUndefined();
    expect(managers.tab.tabs[managers.tab.activeTab]).toBe(tab);
  });

  it('does nothing for an instance key with no open tab', async () => {
    const managers = makeManagers();
    const host = hostFor(managers);
    const tab = await openTab(host, managers);

    await host.intent(tab.label, 'left', '/tmp/gone.fixture');

    expect(tab.dock).toBeUndefined();
    expect(host.statusFor('fixture')?.state).toBe('active');
  });

  it('cannot dock a tab another plugin opened', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, [manifest('fixture'), manifest('other')]);
    const mine = await openTab(host, managers);
    const theirs = await openTab(host, managers, 'other', '/tmp/b.other');

    await host.intent(mine.label, 'left', '/tmp/b.other');

    expect(theirs.dock).toBeUndefined();
    expect(mine.dock).toBeUndefined();
  });

  it('disables a plugin that docks without declaring the capability', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, [manifest('fixture', ['openOrFocusTab'])]);
    const tab = await openTab(host, managers);

    await expect(host.intent(tab.label, 'left', '/tmp/a.fixture')).rejects.toThrow();

    expect(host.statusFor('fixture')?.reason)
      .toContain('used capability "dockTab" without declaring it');
  });
});
