import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { TabManager } from '../tab/manager.js';
import { buildTabView } from '../tab/view.js';
import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginCapabilityName,
  type TabPluginDeclaration,
} from './api.js';
import { TabPluginHost } from './host.js';

function manifest(
  id: string,
  capabilities: readonly TabPluginCapabilityName[] = ['openOrFocusTab', 'snapshotTab'],
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

// One plugin whose opener opens a tab keyed by the file it was given, and whose intent snapshots the
// instance key it was handed with the text carried in the intent name.
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
        capabilities.snapshotTab(String(request.payload), request.intent);
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

describe('snapshotTab', () => {
  it('caches the text against the plugin\'s own tab, with a fresh timestamp', async () => {
    const managers = makeManagers();
    const host = hostFor(managers);
    const tab = await openTab(host, managers);
    const before = Date.now();

    await host.intent(tab.label, 'visible text', '/tmp/a.fixture');

    expect(tab.pageSnapshot?.text).toBe('visible text');
    expect(tab.pageSnapshot?.capturedAt).toBeGreaterThanOrEqual(before);
  });

  // The cache exists for the monitor to read synchronously on its own flush; broadcasting it would
  // ship a third party's page text to every connected client on every relay.
  it('never reaches the wire', async () => {
    const managers = makeManagers();
    const host = hostFor(managers);
    const tab = await openTab(host, managers);
    await host.intent(tab.label, 'visible text', '/tmp/a.fixture');

    const view = buildTabView(tab, false, '/', undefined, [], [], [], (path) => path);

    expect(JSON.stringify(view)).not.toContain('visible text');
  });

  it('does nothing for an instance key with no open tab', async () => {
    const managers = makeManagers();
    const host = hostFor(managers);
    const tab = await openTab(host, managers);

    await host.intent(tab.label, 'visible text', '/tmp/gone.fixture');

    expect(tab.pageSnapshot).toBeUndefined();
    expect(host.statusFor('fixture')?.state).toBe('active');
  });

  it('cannot write a tab another plugin opened', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, [manifest('fixture'), manifest('other')]);
    const mine = await openTab(host, managers);
    const theirs = await openTab(host, managers, 'other', '/tmp/b.other');

    await host.intent(mine.label, 'visible text', '/tmp/b.other');

    expect(theirs.pageSnapshot).toBeUndefined();
    expect(mine.pageSnapshot).toBeUndefined();
  });

  it('disables a plugin that snapshots without declaring the capability', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, [manifest('fixture', ['openOrFocusTab'])]);
    const tab = await openTab(host, managers);

    await expect(host.intent(tab.label, 'visible text', '/tmp/a.fixture')).rejects.toThrow();

    expect(host.statusFor('fixture')?.reason)
      .toContain('used capability "snapshotTab" without declaring it');
  });
});
