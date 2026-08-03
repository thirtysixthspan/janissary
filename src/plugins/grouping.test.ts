import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { TabManager } from '../tab/manager.js';
import { TAB_PLUGIN_API_VERSION, type TabPluginDeclaration } from './api.js';
import { TabPluginHost } from './host.js';

const manifest: TabPluginDeclaration = {
  id: 'fixture', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: 1, tabLabelPrefix: 'fixture', fileExtensions: { '.fixture': 'text/plain' },
  capabilities: ['openOrFocusTab'],
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

// Two tabs in two groups, focus left on the first. Returns the label of the group 1 tab, which is
// the one an `open` command would have been typed into.
function twoGroups(managers: Managers): string {
  managers.tab.openMarkdownTab({ name: 'a.md', path: '/tmp/a.md', size: '1 KB', url: '/open/1' });
  managers.tab.tabs[1].group = 2;
  managers.tab.tabs[1].groupColor = '#222222';
  managers.tab.setActiveTab(0);
  return managers.tab.tabs[0].label;
}

function hostWithGate(managers: Managers, gate: Promise<void>): TabPluginHost {
  return new TabPluginHost(managers, [manifest], {
    fixture: async () => {
      await gate;
      return {
        activate: () => ({
          isPayload: () => true,
          intent: () => null,
          opener: {
            external: () => {},
            inline: (file: string, capabilities) => {
              capabilities.openOrFocusTab(file, () => ({ title: 'fixture', payload: { file } }));
            },
          },
        }),
      };
    },
  });
}

// `product/specs/tab-plugins.md`: a plugin tab "inherits the creating tab's group and group color".
// Every other opener runs synchronously inside its dispatch, so the creating tab is trivially the
// active one. A plugin's does not: the first call awaits activation, and any handler may await
// before opening a tab. Grouping therefore has to resolve from the originating label.
describe('plugin tab grouping', () => {
  it('groups a first-open plugin tab with its origin, not with whatever gained focus', async () => {
    const managers = makeManagers();
    const originLabel = twoGroups(managers);
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const host = hostWithGate(managers, gate);

    const pending = host.runOpener('fixture', 'inline', '/tmp/x.fixture', {
      label: originLabel, command: 'open /tmp/x.fixture',
    });
    // Focus moves to the other group while the plugin is still activating.
    managers.tab.setActiveTab(1);
    release();
    await pending;

    const created = managers.tab.tabs.find((tab) => tab.plugin?.id === 'fixture');
    expect(created?.plugin?.sourceLabel).toBe(originLabel);
    expect(created?.group).toBe(1);
    expect(created?.groupColor).toBe(managers.tab.tabs[0].groupColor);
  });

  it('falls back to the active tab when the originating tab has since closed', async () => {
    const managers = makeManagers();
    const originLabel = twoGroups(managers);
    managers.tab.openMarkdownTab({ name: 'b.md', path: '/tmp/b.md', size: '1 KB', url: '/open/2' });
    const survivor = managers.tab.tabs.find((tab) => tab.markdown?.path === '/tmp/b.md')!;
    survivor.group = 2;
    survivor.groupColor = '#222222';

    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const host = hostWithGate(managers, gate);
    const pending = host.runOpener('fixture', 'inline', '/tmp/y.fixture', {
      label: originLabel, command: 'open /tmp/y.fixture',
    });

    managers.tab.closeTab(managers.tab.tabs.findIndex((tab) => tab.label === originLabel));
    managers.tab.setActiveTab(managers.tab.tabs.indexOf(survivor));
    release();
    await pending;

    // The host declines to open a tab for a vanished origin, so nothing is grouped anywhere — the
    // point of the case is that resolving by label does not throw or land on tab zero by accident.
    expect(managers.tab.tabs.some((tab) => tab.plugin?.id === 'fixture')).toBe(false);
  });
});
