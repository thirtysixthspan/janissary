import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { TabManager } from '../tab/manager.js';
import { messageBus } from '../bus.js';
import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginCapabilityName,
  type TabPluginDeclaration,
  type TabPluginTabUpdate,
} from './api.js';
import { TabPluginHost } from './host.js';

function manifest(
  id: string,
  capabilities: readonly TabPluginCapabilityName[] = ['openOrFocusTab', 'updateTab'],
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

// One plugin whose intent applies whatever update the test handed it, and whose opener opens a tab
// keyed by the file it was given. `isPayload` accepts any record carrying a string `text`, so a test
// can produce a payload its own guard refuses.
function hostFor(
  managers: Managers,
  update: () => TabPluginTabUpdate,
  declarations: TabPluginDeclaration[] = [manifest('fixture')],
): TabPluginHost {
  const loaders = Object.fromEntries(declarations.map((declaration) => [declaration.id, async () => ({
    activate: () => ({
      isPayload: (value: unknown): boolean =>
        typeof value === 'object' && value !== null && typeof (value as { text?: unknown }).text === 'string',
      opener: {
        external: () => {},
        inline: (file: string, capabilities) => {
          capabilities.openOrFocusTab(file, (resources) => ({
            title: 'fixture',
            payload: { text: file, url: resources.registerFile(file) },
          }));
        },
      },
      intent: (request, capabilities) => {
        capabilities.updateTab(String(request.payload), update);
        return null;
      },
    }),
  })]));
  return new TabPluginHost(managers, declarations, loaders);
}

async function openTab(host: TabPluginHost, managers: Managers, file = '/tmp/a.fixture') {
  await host.runOpener('fixture', 'inline', file, { label: managers.tab.tabs[0].label, command: `open ${file}` });
  return managers.tab.tabs.find((tab) => tab.plugin)!;
}

function countStateEmits(): { count: () => number; stop: () => void } {
  let emits = 0;
  const subscription = messageBus.on('state', 'dirty', () => { emits += 1; });
  return { count: () => emits, stop: () => { subscription.unsubscribe(); } };
}

describe('updateTab', () => {
  it('replaces the payload and leaves every other part of the tab alone', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, () => ({ payload: { text: 'second' } }));
    const tab = await openTab(host, managers);
    const before = {
      label: tab.label, number: tab.number, group: tab.group, title: tab.title,
      instanceKey: tab.plugin!.instanceKey, schemaVersion: tab.plugin!.schemaVersion,
      sourceLabel: tab.plugin!.sourceLabel, fileRefs: [...tab.plugin!.fileRefs],
      activeTab: managers.tab.activeTab, index: managers.tab.tabs.indexOf(tab),
    };

    await host.intent(tab.label, 'refresh', '/tmp/a.fixture');

    expect(tab.plugin!.payload).toEqual({ text: 'second' });
    expect({
      label: tab.label, number: tab.number, group: tab.group, title: tab.title,
      instanceKey: tab.plugin!.instanceKey, schemaVersion: tab.plugin!.schemaVersion,
      sourceLabel: tab.plugin!.sourceLabel, fileRefs: [...tab.plugin!.fileRefs],
      activeTab: managers.tab.activeTab, index: managers.tab.tabs.indexOf(tab),
    }).toEqual(before);
  });

  it('replaces the title when the factory returns one, over a name the user chose', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, () => ({ title: 'pushed', payload: { text: 'second' } }));
    const tab = await openTab(host, managers);
    // What a rename leaves behind (see `renameTabOp`): a display title on the tab itself.
    tab.title = 'user alias';

    await host.intent(tab.label, 'refresh', '/tmp/a.fixture');

    expect(tab.title).toBe('pushed');
  });

  it('leaves the title alone when the factory returns none', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, () => ({ payload: { text: 'second' } }));
    const tab = await openTab(host, managers);
    tab.title = 'user alias';

    await host.intent(tab.label, 'refresh', '/tmp/a.fixture');

    expect(tab.title).toBe('user alias');
    expect(tab.plugin!.payload).toEqual({ text: 'second' });
  });

  it('does nothing at all for an instance key with no open tab', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, () => ({ payload: { text: 'second' } }));
    const tab = await openTab(host, managers);
    const emits = countStateEmits();

    await host.intent(tab.label, 'refresh', '/tmp/gone.fixture');
    emits.stop();

    expect(tab.plugin!.payload).toMatchObject({ text: '/tmp/a.fixture' });
    expect(emits.count()).toBe(0);
    expect(host.statusFor('fixture')?.state).toBe('active');
    expect(managers.tab.tabs[0].log).toEqual([]);
  });

  it('cannot write a tab another plugin opened', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, () => ({ payload: { text: 'second' } }),
      [manifest('fixture'), manifest('other')]);
    const mine = await openTab(host, managers);
    await host.runOpener('other', 'inline', '/tmp/b.other', {
      label: managers.tab.tabs[0].label, command: 'open /tmp/b.other',
    });
    const theirs = managers.tab.tabs.find((tab) => tab.plugin?.id === 'other')!;

    // The fixture plugin, asked to update the other plugin's instance key.
    await host.intent(mine.label, 'refresh', '/tmp/b.other');

    expect(theirs.plugin!.payload).toMatchObject({ text: '/tmp/b.other' });
    expect(mine.plugin!.payload).toMatchObject({ text: '/tmp/a.fixture' });
  });

  it.each([
    ['a payload its own guard rejects', () => ({ payload: { text: 42 } })],
    ['a payload that is not JSON-compatible', () => ({ payload: { text: 'x', later: () => {} } })],
    ['an empty title', () => ({ title: '  ', payload: { text: 'x' } })],
  ])('disables the plugin and closes its tabs on %s', async (_name, update) => {
    const managers = makeManagers();
    const host = hostFor(managers, update as () => TabPluginTabUpdate);
    const tab = await openTab(host, managers);

    await expect(host.intent(tab.label, 'refresh', '/tmp/a.fixture')).rejects.toThrow();

    expect(host.statusFor('fixture')?.state).toBe('disabled');
    expect(managers.tab.tabs.some((candidate) => candidate.plugin)).toBe(false);
  });

  it('disables a plugin that calls updateTab without declaring it', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, () => ({ payload: { text: 'second' } }),
      [manifest('fixture', ['openOrFocusTab'])]);
    const tab = await openTab(host, managers);

    await expect(host.intent(tab.label, 'refresh', '/tmp/a.fixture')).rejects.toThrow();

    expect(host.statusFor('fixture')?.reason).toContain('used capability "updateTab" without declaring it');
  });

  it('does nothing once the plugin has been disabled', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, () => ({ payload: { text: 'second' } }));
    await openTab(host, managers);
    host.clientFailed(managers.tab.tabs.find((tab) => tab.plugin)!.label, 'client gave up');
    const emits = countStateEmits();

    await expect(host.intent('fixture', 'refresh', '/tmp/a.fixture')).rejects.toThrow();
    emits.stop();

    expect(emits.count()).toBe(0);
  });

  it('applies from an opener as well as from an intent', async () => {
    const managers = makeManagers();
    const declarations = [manifest('fixture')];
    const host = new TabPluginHost(managers, declarations, {
      fixture: async () => ({
        activate: () => ({
          isPayload: () => true,
          intent: () => null,
          opener: {
            external: () => {},
            inline: (file: string, capabilities) => {
              capabilities.openOrFocusTab(file, () => ({ title: 'fixture', payload: { text: 'first' } }));
              capabilities.updateTab(file, () => ({ payload: { text: 'from the opener' } }));
            },
          },
        }),
      }),
    });

    const tab = await openTab(host, managers);

    expect(tab.plugin!.payload).toEqual({ text: 'from the opener' });
  });
});
