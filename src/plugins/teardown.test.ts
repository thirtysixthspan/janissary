import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { TabManager } from '../tab/manager.js';
import type { TabPluginActivation, TabPluginDeclaration } from './api.js';
import { TAB_PLUGIN_API_VERSION } from './api.js';
import { TabPluginHost } from './host.js';

const manifest: TabPluginDeclaration = {
  id: 'fixture', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: 1, tabLabelPrefix: 'fixture', fileExtensions: { '.fixture': 'text/plain' },
  capabilities: ['openOrFocusTab', 'reportFailure'],
};

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

function openFixture(managers: Managers, key: string, file: string): void {
  managers.tab.openPluginTab('fixture', 'fixture', key, 1, 'janus', (resources) => ({
    title: key,
    payload: { resource: resources.registerFile(file) },
  }));
}

describe('plugin teardown', () => {
  it('closes every disabled plugin tab, releases its files, and preserves its failure', async () => {
    const managers = makeManagers();
    openFixture(managers, 'first', '/tmp/first.fixture');
    openFixture(managers, 'second', '/tmp/second.fixture');
    managers.tab.registerFile('/tmp/unrelated.txt');
    const pluginTab = managers.tab.tabs.find((tab) => tab.plugin?.instanceKey === 'first')!;
    const host = new TabPluginHost(managers, [manifest], {});

    host.clientFailed(pluginTab.label, 'client render exploded');

    expect(managers.tab.tabs.filter((tab) => tab.plugin?.id === 'fixture')).toEqual([]);
    expect([...managers.tab.openFiles.values()]).toEqual(['/tmp/unrelated.txt']);
    expect(host.statusFor('fixture')).toEqual({
      state: 'disabled', reason: 'client render exploded',
    });
    await expect(host.intent(pluginTab.label, 'retry', {}))
      .rejects.toThrow('Tab plugin "fixture" disabled: client render exploded.');
  });

  it('opens no tab and leaks no file when payload validation fails before mount', async () => {
    const managers = makeManagers();
    const activation: TabPluginActivation = {
      isPayload: () => false,
      opener: {
        inline: (file, capabilities) => {
          capabilities.openOrFocusTab(file, (resources) => ({
            title: 'invalid', payload: { resource: resources.registerFile(file) },
          }));
        },
        external: () => {},
      },
      intent: () => null,
    };
    const host = new TabPluginHost(
      managers, [manifest], { fixture: async () => ({ activate: () => activation }) },
    );
    const before = managers.tab.tabs.length;

    await host.runOpener('fixture', 'inline', '/tmp/invalid.fixture', {
      label: 'janus', command: 'open invalid.fixture',
    });

    expect(managers.tab.tabs).toHaveLength(before);
    expect(managers.tab.openFiles.size).toBe(0);
    expect(host.statusFor('fixture')).toMatchObject({
      state: 'disabled', reason: 'produced an invalid tab payload',
    });
  });
});
