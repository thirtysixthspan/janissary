import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import {
  TAB_PLUGIN_API_VERSION,
  TAB_PLUGIN_CAPABILITY_NAMES,
  type TabPluginActivation,
  type TabPluginCapabilityName,
  type TabPluginDeclaration,
  type TabPluginServerCapabilities,
} from './api.js';
import { createPluginContext, isJsonCompatible } from './context.js';
import { TabPluginHost } from './host.js';

const origin = { label: 'janus', command: 'fixture' };

function declaration(
  capabilities: readonly TabPluginCapabilityName[],
  notifications?: TabPluginDeclaration['notifications'],
): TabPluginDeclaration {
  return {
    id: 'fixture', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: 1, tabLabelPrefix: 'fixture', fileExtensions: { '.fixture': 'text/plain' },
    capabilities, notifications,
  };
}

function makeManagers() {
  const append = vi.fn();
  const tabs = [{ label: 'janus', dotColor: '#fff', log: [] }];
  const managers = {
    tab: { tabs, append, closeTab: vi.fn(), openPluginTab: vi.fn(), cur: () => tabs[0] },
    openFile: { runAs: vi.fn(async () => {}) },
  } as unknown as Managers;
  return { append, managers };
}

function contextFor(
  capabilities: readonly TabPluginCapabilityName[],
  isEnabled: () => boolean = () => true,
  openRequests: string[] = [],
): TabPluginServerCapabilities {
  const activation: TabPluginActivation = {
    isPayload: () => true, intent: () => null, opener: { inline: () => {}, external: () => {} },
  };
  return createPluginContext(
    makeManagers().managers, declaration(capabilities), activation, origin, isEnabled, openRequests,
  );
}

// The `capabilities` field is a manifest's statement of its own reach. Enforcing it is what keeps
// that statement meaningful: while every plugin received the whole context regardless, an
// under-declared manifest kept working and the declaration described nothing.
describe('declared capability enforcement', () => {
  it('grants exactly what the declaration asked for', () => {
    const capabilities = contextFor(['note']);

    expect(() => { capabilities.note('allowed'); }).not.toThrow();
    expect(() => { capabilities.openClaimedFiles('clip.fixture'); })
      .toThrow('used capability "openClaimedFiles" without declaring it');
    expect(() => capabilities.configuredViewer())
      .toThrow('used capability "configuredViewer" without declaring it');
  });

  it('refuses every capability when the declaration asked for none', () => {
    const capabilities = contextFor([]);

    for (const name of TAB_PLUGIN_CAPABILITY_NAMES) {
      expect(() => (capabilities[name] as () => unknown)())
        .toThrow(`used capability "${name}" without declaring it`);
    }
  });

  it('keeps every capability reachable when the declaration asked for all of them', () => {
    const capabilities = contextFor(TAB_PLUGIN_CAPABILITY_NAMES);

    expect(() => { capabilities.note('fine'); }).not.toThrow();
    expect(capabilities.configuredViewer()).toBe('');
    expect(() => capabilities.rejectRequest('a bad request')).toThrow('a bad request');
  });

  it('disables the plugin when it reaches past its declaration', async () => {
    const { append, managers } = makeManagers();
    const host = new TabPluginHost(managers, [declaration(['note'])], {
      fixture: async () => ({
        activate: () => ({
          isPayload: () => true,
          intent: () => null,
          opener: {
            external: () => {},
            inline: (_file: string, capabilities: TabPluginServerCapabilities) => {
              capabilities.openOrFocusTab('key', () => ({ title: 't', payload: {} }));
            },
          },
        }),
      }),
    });

    await host.runOpener('fixture', 'inline', '/tmp/a.fixture', origin);

    // A capability violation is the plugin's own mistake, so it crosses the failure boundary
    // rather than being answered as a bad request.
    expect(host.statusFor('fixture')).toMatchObject({ state: 'disabled' });
    expect(append).toHaveBeenCalledWith('janus', expect.objectContaining({
      output: 'Tab plugin "fixture" disabled: used capability "openOrFocusTab" without declaring it.',
    }));
  });
});

// Everything a plugin produces — a tab payload, an intent result — is broadcast or replied to as
// JSON. Values JavaScript is happy with but JSON is not would be silently rewritten in transit, so
// the host refuses them at the boundary rather than letting a client receive something else.
describe('isJsonCompatible', () => {
  it('accepts the JSON value space, including nesting', () => {
    expect(isJsonCompatible(null)).toBe(true);
    expect(isJsonCompatible('text')).toBe(true);
    expect(isJsonCompatible(false)).toBe(true);
    expect(isJsonCompatible(0)).toBe(true);
    expect(isJsonCompatible([1, 'two', { three: [true, null] }])).toBe(true);
    expect(isJsonCompatible({ nested: { deeper: ['ok'] } })).toBe(true);
  });

  it('refuses numbers that JSON cannot round-trip', () => {
    expect(isJsonCompatible(NaN)).toBe(false);
    expect(isJsonCompatible(Infinity)).toBe(false);
    expect(isJsonCompatible({ size: NaN })).toBe(false);
    expect(isJsonCompatible([1, -Infinity])).toBe(false);
  });

  it('refuses values with no JSON representation at all', () => {
    expect(isJsonCompatible(undefined)).toBe(false);
    expect(isJsonCompatible(1n)).toBe(false);
    expect(isJsonCompatible(() => {})).toBe(false);
    expect(isJsonCompatible(Symbol('nope'))).toBe(false);
  });

  // Serializing one of these throws rather than producing wrong output, so the walk has to notice
  // the cycle itself instead of recursing until the stack runs out.
  it('refuses a cycle without recursing forever', () => {
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;
    expect(isJsonCompatible(circular)).toBe(false);

    const viaArray: unknown[] = ['first'];
    viaArray.push(viaArray);
    expect(isJsonCompatible(viaArray)).toBe(false);
  });

  it('accepts the same value appearing twice without calling it a cycle', () => {
    const shared = { shared: true };
    expect(isJsonCompatible({ left: shared, right: shared })).toBe(true);
    expect(isJsonCompatible([shared, shared])).toBe(true);
  });
});

// Capabilities are revoked the moment a plugin stops being the host's live plugin — after a timeout
// it lost, after disablement, after shutdown. A handler that kept running does not get to keep
// acting through the object it was handed.
describe('capability revocation', () => {
  it('returns each topic zero value after the plugin is disabled', () => {
    const { managers } = makeManagers();
    const activation: TabPluginActivation = {
      isPayload: () => true, intent: () => null,
      opener: { inline: () => {}, external: () => {} },
    };
    const conversations = createPluginContext(
      managers,
      declaration(['topicData'], ['conversations']),
      activation,
      origin,
      () => false,
    );
    expect(conversations.topicData('conversations')).toEqual({
      summaries: [], windows: [], models: [],
    });
  });

  it('turns side-effecting capabilities into no-ops once the plugin is no longer enabled', () => {
    const { managers } = makeManagers();
    const openRequests: string[] = [];
    const revoked = createPluginContext(
      managers,
      declaration(TAB_PLUGIN_CAPABILITY_NAMES),
      { isPayload: () => true, intent: () => null, opener: { inline: () => {}, external: () => {} } },
      origin,
      () => false,
      openRequests,
    );

    revoked.note('too late');
    revoked.openOrFocusTab('key', () => ({ title: 'late', payload: {} }));
    revoked.openClaimedFiles('clip.fixture');

    expect(managers.tab.append).not.toHaveBeenCalled();
    expect(managers.tab.openPluginTab).not.toHaveBeenCalled();
    expect(openRequests).toEqual([]);
    expect(revoked.configuredViewer()).toBe('');
    expect(revoked.openExternally('/tmp/clip.fixture')).toBe(false);
  });

  it('drops a note and a tab whose originating transcript has already closed', () => {
    const { managers } = makeManagers();
    managers.tab.tabs.length = 0;
    const orphaned = createPluginContext(
      managers,
      declaration(TAB_PLUGIN_CAPABILITY_NAMES),
      { isPayload: () => true, intent: () => null, opener: { inline: () => {}, external: () => {} } },
      origin,
      () => true,
    );

    orphaned.note('nobody is listening');
    orphaned.openOrFocusTab('key', () => ({ title: 'orphan', payload: {} }));
    expect(managers.tab.append).not.toHaveBeenCalled();
    expect(managers.tab.openPluginTab).not.toHaveBeenCalled();
  });

  // The title is the tab's display identity, so an empty one would leave a tab the user cannot name
  // in the strip. Both this and the payload guard run inside the factory wrapper, before the host
  // has created anything — so the tab manager here has to actually call the factory to reach them.
  it('refuses a tab title that is empty or only whitespace', () => {
    const { managers } = makeManagers();
    const openPluginTab = vi.fn((
      _id: string, _prefix: string, _key: string, _schema: number, _source: string,
      factory: (resources: { registerFile(file: string): string }) => unknown,
    ) => { factory({ registerFile: () => '/open/ref' }); });
    managers.tab.openPluginTab = openPluginTab as unknown as typeof managers.tab.openPluginTab;
    const capabilities = createPluginContext(
      managers,
      declaration(TAB_PLUGIN_CAPABILITY_NAMES),
      { isPayload: () => true, intent: () => null, opener: { inline: () => {}, external: () => {} } },
      origin,
      () => true,
    );

    expect(() => { capabilities.openOrFocusTab('key', () => ({ title: '', payload: {} })); })
      .toThrow('produced an empty tab title');
    expect(() => { capabilities.openOrFocusTab('key', () => ({ title: '\t\n ', payload: {} })); })
      .toThrow('produced an empty tab title');
    expect(() => { capabilities.openOrFocusTab('key', () => ({ title: 'fine', payload: {} })); })
      .not.toThrow();
  });

  it('queues a claimed open for the host rather than running it inside the guarded call', () => {
    const openRequests: string[] = [];
    const capabilities = contextFor(TAB_PLUGIN_CAPABILITY_NAMES, () => true, openRequests);
    capabilities.openClaimedFiles('~/clips/*.fixture');
    expect(openRequests).toEqual(['~/clips/*.fixture']);
  });

  it('reports a thrown non-Error as a failure without losing what it said', () => {
    const capabilities = contextFor(TAB_PLUGIN_CAPABILITY_NAMES);
    expect(() => capabilities.reportFailure('plain string reason')).toThrow('plain string reason');
    expect(() => capabilities.reportFailure(new Error('already an error')))
      .toThrow('already an error');
  });
});
