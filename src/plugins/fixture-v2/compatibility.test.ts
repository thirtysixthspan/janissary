import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../../managers.js';
import { fakeNotificationsHost } from '../../notifications/tab-test-fixture.js';
import { NotificationQueue } from '../../notifications/queue.js';
import type { Tab } from '../../tab/types.js';
import { createPluginCommands } from '../command-adapter.js';
import { createPluginOpeners } from '../opener-adapter.js';
import { TAB_PLUGIN_API_VERSION } from '../api.js';
import { TabPluginHost } from '../host.js';
import { activate } from './activate.js';
import { fixtureV2Manifest } from './manifest.js';
import { isFixturePayload } from './shared.js';

function makeManagers() {
  const openFiles = new Map<string, string>();
  const tabs = [{ label: 'janus', dotColor: '#fff', log: [] }] as Tab[];
  let nextReference = 0;
  const registerFile = (file: string) => {
    const id = `fixture-${++nextReference}`;
    openFiles.set(id, file);
    return `/open/${id}`;
  };
  const tab = {
    tabs,
    openFiles,
    append: vi.fn(),
    cur: () => tabs[0],
    ...fakeNotificationsHost(tabs),
    registerFile,
    openPluginTab: (
      id: string, prefix: string, key: string, schema: number, source: string,
      factory: (resources: { registerFile(file: string): string }) => { title: string; payload: unknown },
    ) => {
      const created = factory({ registerFile });
      tabs.push({
        label: prefix, dotColor: '#123', number: 2, group: 1, groupColor: '#fff',
        log: [], cmdHistory: [], cmdHistoryIdx: -1, scrollOffset: 0,
        runtime: { busy: false, context: [], queue: [] }, view: 'plugin', title: created.title,
        plugin: {
          id, instanceKey: key, schemaVersion: schema, payload: created.payload,
          fileRefs: [...openFiles.keys()], sourceLabel: source,
        },
      });
    },
    closeTab: (index: number) => {
      const [closed] = tabs.splice(index, 1);
      const references = closed.plugin?.fileRefs ?? [];
      for (const reference of references) openFiles.delete(reference);
    },
  };
  const managers = { tab, notifications: new NotificationQueue() } as unknown as Managers;
  return { managers, openFiles, tabs };
}

const currentHostManifest = { ...fixtureV2Manifest, apiVersion: TAB_PLUGIN_API_VERSION };

describe('host API v3 compatibility with the frozen v2 fixture', () => {
  it('rejects the literal v2 declaration without loading its activation', async () => {
    expect(TAB_PLUGIN_API_VERSION).toBe(3);
    expect(fixtureV2Manifest.apiVersion).toBe(2);
    const loader = vi.fn(async () => ({ activate }));
    const host = new TabPluginHost(makeManagers().managers, [fixtureV2Manifest], { 'fixture-v2': loader });

    await host.runCommand('fixture-v2', 'fixture-v2 hello', { label: 'janus', command: 'fixture-v2 hello' });

    expect(loader).not.toHaveBeenCalled();
    expect(host.statusFor('fixture-v2')).toEqual({ state: 'disabled', reason: 'requires tab plugin API 2; host provides 3' });
    host.dispose();
  });

  it('round-trips the same frozen behavior explicitly declared at v3', async () => {
    expect(currentHostManifest.apiVersion).toBe(3);
    expect(createPluginOpeners([currentHostManifest], [])[0].extensions).toEqual(['.janissary-plugin-v2']);
    expect(createPluginCommands([currentHostManifest], [])[0].name).toBe('fixture-v2');
    const fixture = makeManagers();
    const dispose = vi.fn();
    const host = new TabPluginHost(fixture.managers, [currentHostManifest], {
      'fixture-v2': async () => ({ activate: () => ({ ...activate(), dispose }) }),
    });
    await host.runOpener('fixture-v2', 'inline', '/tmp/sample.janissary-plugin-v2', {
      label: 'janus', command: 'open sample.janissary-plugin-v2',
    });

    const opened = fixture.tabs.find((tab) => tab.plugin?.id === 'fixture-v2')!;
    expect(isFixturePayload(opened.plugin?.payload)).toBe(true);
    expect(opened.plugin).toMatchObject({
      schemaVersion: 1,
      payload: { text: '/tmp/sample.janissary-plugin-v2', resource: expect.stringMatching(/^\/open\//u) },
    });
    await expect(host.intent(opened.label, 'echo', { value: 'round trip' })).resolves.toEqual({ echoed: 'round trip' });
    await expect(host.intent(opened.label, 'nope', {})).rejects.toThrow('invalid fixture intent "nope"');
    expect(host.statusFor('fixture-v2')).toMatchObject({ state: 'active' });

    fixture.managers.tab.closeTab(fixture.tabs.indexOf(opened));
    host.dispose();
    host.dispose();
    expect(fixture.openFiles.size).toBe(0);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('retains command rejection, external opening, and isolated failure cleanup', async () => {
    const fixture = makeManagers();
    const dispose = vi.fn();
    const host = new TabPluginHost(fixture.managers, [currentHostManifest], {
      'fixture-v2': async () => ({ activate: () => ({ ...activate(), dispose }) }),
    });
    const origin = { label: 'janus', command: 'fixture-v2 hello' };
    await host.runCommand('fixture-v2', 'fixture-v2 hello', origin);
    expect(fixture.managers.tab.append).toHaveBeenCalledWith('janus', { input: origin.command, output: 'Fixture command: hello' });
    await host.runCommand('fixture-v2', 'fixture-v2', { label: 'janus', command: 'fixture-v2' });
    expect(fixture.managers.tab.append).toHaveBeenCalledWith('janus', { input: 'fixture-v2', output: 'Usage: fixture-v2 <text>' });
    expect(host.statusFor('fixture-v2')).toMatchObject({ state: 'active' });
    await host.runOpener('fixture-v2', 'external', '/tmp/external.janissary-plugin-v2', origin);
    expect(fixture.managers.tab.append).toHaveBeenCalledWith('janus', { input: origin.command, output: 'Fixture external: /tmp/external.janissary-plugin-v2' });

    await host.runOpener('fixture-v2', 'inline', '/tmp/broken.janissary-plugin-v2', origin);
    const opened = fixture.tabs.find((tab) => tab.plugin?.id === 'fixture-v2')!;
    await expect(host.intent(opened.label, 'break', {})).rejects.toThrow('Tab plugin "fixture-v2" disabled: fixture broke on purpose.');
    expect(host.statusFor('fixture-v2')).toMatchObject({ state: 'disabled' });
    expect(fixture.tabs.map((tab) => tab.label)).toEqual(['janus']);
    expect(fixture.openFiles.size).toBe(0);
    host.dispose();
    host.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
