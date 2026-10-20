import { afterEach, describe, expect, it, vi } from 'vitest';
import { MANAGER_TAB_RELEASE, type Managers } from '../managers.js';
import { messageBus } from '../bus.js';
import { TabManager } from '../tab/manager.js';
import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginCapabilityName,
  type TabPluginDeclaration,
} from './api.js';
import { TabPluginHost } from './host.js';
import { ownTabCapabilities } from './own-tab-capabilities.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';

function manifest(
  id: string,
  capabilities: readonly TabPluginCapabilityName[] = ['openOrFocusTab', 'closeOwnTab'],
): TabPluginDeclaration {
  return {
    id, version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION, payloadSchemaVersion: 1,
    tabLabelPrefix: id, fileExtensions: { [`.${id}`]: 'text/plain' }, capabilities,
  };
}

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  seedRootTab(managers.tab);
  const releasers = Object.fromEntries(MANAGER_TAB_RELEASE.map((name) => [name, { closeTab: vi.fn() }]));
  Object.assign(managers, releasers, {
    workspace: { remove: vi.fn(), cancel: vi.fn() },
  } as unknown as Managers);
  return managers;
}

// One plugin whose opener opens a tab keyed by the file it was given, and whose intent closes the
// instance key it was handed.
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
        capabilities.closeOwnTab(String(request.payload));
        return null;
      },
    }),
  })]));
  return new TabPluginHost(managers, declarations, loaders);
}

async function openTab(host: TabPluginHost, managers: Managers, id = 'fixture', file = '/tmp/a.fixture') {
  await host.runOpener(id, 'inline', file, { label: managers.tab.tabs[0].label, command: `open ${file}` });
  return managers.tab.tabs.find((tab) => tab.plugin?.id === id && tab.plugin.instanceKey === file)!;
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => { vi.restoreAllMocks(); });

describe('closeOwnTab', () => {
  it('closes this plugin\'s own tab and leaves another plugin\'s tab with the same key open', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, [manifest('fixture'), manifest('other')]);
    const mine = await openTab(host, managers, 'fixture', '/tmp/a.shared');
    const theirs = await openTab(host, managers, 'other', '/tmp/a.shared');

    await host.intent(mine.label, 'close', '/tmp/a.shared');
    await settle();

    const labels = managers.tab.tabs.map((tab) => tab.label);
    expect(labels).not.toContain(mine.label);
    expect(labels).toContain(theirs.label);
  });

  it('releases the tab\'s resources through the ordinary close path', async () => {
    const managers = makeManagers();
    const host = hostFor(managers);
    const tab = await openTab(host, managers);

    await host.intent(tab.label, 'close', '/tmp/a.fixture');
    await settle();

    expect(managers.pty.closeTab).toHaveBeenCalledWith(tab.label);
  });

  it('does nothing for an unknown instance key', async () => {
    const managers = makeManagers();
    const host = hostFor(managers);
    const tab = await openTab(host, managers);

    await host.intent(tab.label, 'close', '/tmp/gone.fixture');
    await settle();

    expect(managers.tab.tabs).toContain(tab);
    expect(host.statusFor('fixture')?.state).toBe('active');
  });

  it('does nothing while the plugin is disabled', async () => {
    const managers = makeManagers();
    const declaration = manifest('fixture');
    const host = hostFor(managers, [declaration]);
    const tab = await openTab(host, managers);
    const capabilities = ownTabCapabilities({ managers, declaration, isEnabled: () => false });

    capabilities.closeOwnTab('/tmp/a.fixture');
    await settle();

    expect(managers.tab.tabs).toContain(tab);
  });

  it('does not close, or quit the app, when the tab is the only one counting for quit', async () => {
    const managers = makeManagers();
    const host = hostFor(managers);
    const tab = await openTab(host, managers);
    for (const other of managers.tab.tabs) if (other !== tab) other.dock = 'left';
    const emit = vi.spyOn(messageBus, 'emit');

    await host.intent(tab.label, 'close', '/tmp/a.fixture');
    await settle();

    expect(managers.tab.tabs).toContain(tab);
    expect(emit).not.toHaveBeenCalledWith('app', { type: 'exit' });
  });
});
