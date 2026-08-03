import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../../managers.js';
import type { Tab } from '../../tab/types.js';
import { createPluginCommands } from '../command-adapter.js';
import { createPluginOpeners } from '../opener-adapter.js';
import { TAB_PLUGIN_API_VERSION } from '../api.js';
import { TabPluginHost } from '../host.js';
import { activate } from './activate.js';
import { fixtureV1Manifest } from './manifest.js';
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
  return { managers: { tab } as unknown as Managers, openFiles, tabs };
}

describe('frozen tab plugin API v1 fixture', () => {
  it('keeps the v1 declaration, claims, payload, intent, and disposal compatible', async () => {
    expect(TAB_PLUGIN_API_VERSION).toBe(1);
    expect(fixtureV1Manifest.apiVersion).toBe(1);
    expect(createPluginOpeners([fixtureV1Manifest], [])[0].extensions)
      .toEqual(['.janissary-plugin-v1']);
    expect(createPluginCommands([fixtureV1Manifest], [])[0].name).toBe('fixture-v1');

    const fixture = makeManagers();
    const dispose = vi.fn();
    const host = new TabPluginHost(fixture.managers, [fixtureV1Manifest], {
      'fixture-v1': async () => ({
        activate: () => ({ ...activate(), dispose }),
      }),
    });
    await host.runOpener(
      'fixture-v1', 'inline', '/tmp/sample.janissary-plugin-v1',
      { label: 'janus', command: 'open sample.janissary-plugin-v1' },
    );

    const opened = fixture.tabs.find((tab) => tab.plugin?.id === 'fixture-v1')!;
    expect(isFixturePayload(opened.plugin?.payload)).toBe(true);
    expect(opened.plugin).toMatchObject({
      schemaVersion: 1,
      payload: {
        text: '/tmp/sample.janissary-plugin-v1', resource: expect.stringMatching(/^\/open\//u),
      },
    });
    await expect(host.intent(opened.label, 'echo', { value: 'round trip' }))
      .resolves.toEqual({ echoed: 'round trip' });

    // A rejection answers one request; the plugin is still active for the next one.
    await expect(host.intent(opened.label, 'nope', {}))
      .rejects.toThrow('invalid fixture intent "nope"');
    expect(host.statusFor('fixture-v1')).toMatchObject({ state: 'active' });

    fixture.managers.tab.closeTab(fixture.tabs.indexOf(opened));
    host.dispose();
    host.dispose();
    expect(fixture.openFiles.size).toBe(0);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('keeps the v1 command contribution and the failure boundary compatible', async () => {
    const fixture = makeManagers();
    const host = new TabPluginHost(fixture.managers, [fixtureV1Manifest], {
      'fixture-v1': async () => ({ activate }),
    });
    const origin = { label: 'janus', command: 'fixture-v1 hello' };

    await host.runCommand('fixture-v1', 'fixture-v1 hello', origin);
    expect(fixture.managers.tab.append).toHaveBeenCalledWith('janus', {
      input: 'fixture-v1 hello', output: 'Fixture command: hello',
    });

    await host.runCommand('fixture-v1', 'fixture-v1', { label: 'janus', command: 'fixture-v1' });
    expect(fixture.managers.tab.append).toHaveBeenCalledWith('janus', {
      input: 'fixture-v1', output: 'Usage: fixture-v1 <text>',
    });
    expect(host.statusFor('fixture-v1')).toMatchObject({ state: 'active' });

    await host.runOpener(
      'fixture-v1', 'inline', '/tmp/broken.janissary-plugin-v1', origin,
    );
    const opened = fixture.tabs.find((tab) => tab.plugin?.id === 'fixture-v1')!;
    await expect(host.intent(opened.label, 'break', {}))
      .rejects.toThrow('Tab plugin "fixture-v1" disabled: fixture broke on purpose.');
    expect(host.statusFor('fixture-v1')).toMatchObject({ state: 'disabled' });
    expect(fixture.tabs.some((tab) => tab.plugin?.id === 'fixture-v1')).toBe(false);
  });
});
