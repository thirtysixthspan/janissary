import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { getConfig, loadConfig } from '../config.js';
import type { Managers } from '../managers.js';
import { fakeNotificationsHost } from '../notifications/tab-test-fixture.js';
import { NotificationQueue } from '../notifications/queue.js';
import {
  TAB_PLUGIN_API_VERSION,
  TAB_PLUGIN_CAPABILITY_NAMES,
  type TabPluginActivation,
  type TabPluginCapabilityName,
  type TabPluginDeclaration,
  type TabPluginServerCapabilities,
} from './api.js';
import { createPluginContext, isJsonCompatible } from './context.js';
import { messageBus } from '../bus.js';
import { TabPluginHost } from './host.js';

const { armEscalation, cancelEscalation } = vi.hoisted(() => ({
  armEscalation: vi.fn(),
  cancelEscalation: vi.fn(),
}));

vi.mock('../harness/idle-notification.js', () => ({
  armHarnessIdleEscalation: armEscalation,
  cancelHarnessIdleEscalation: cancelEscalation,
}));

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
    tab: {
      tabs, append, closeTab: vi.fn(), openPluginTab: vi.fn(), cur: () => tabs[0],
      launchDir: '/repo',
      ...fakeNotificationsHost(tabs),
      pluginTabByInstanceKey: vi.fn(), markUnread: vi.fn(() => false), clearUnread: vi.fn(),
    },
    openFile: { runAs: vi.fn(async () => {}) },
    notifications: new NotificationQueue(),
  } as unknown as Managers;
  return { append, managers };
}

function activationFor(): TabPluginActivation {
  return {
    isPayload: () => true, intent: () => null, opener: { inline: () => {}, external: () => {} },
  };
}

function contextFor(
  capabilities: readonly TabPluginCapabilityName[],
  isEnabled: () => boolean = () => true,
  openRequests: string[] = [],
  managers: Managers = makeManagers().managers,
): TabPluginServerCapabilities {
  return createPluginContext(
    managers, declaration(capabilities), activationFor(), origin, isEnabled, openRequests,
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
    expect(() => capabilities.setUnread('key', true))
      .toThrow('used capability "setUnread" without declaring it');
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

describe('setUnread', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('marks only a plugin-owned tab and arms escalation only when the badge was raised', () => {
    const { managers } = makeManagers();
    const tab = { label: 'shell1' };
    vi.mocked(managers.tab.pluginTabByInstanceKey).mockReturnValue(tab as never);
    vi.mocked(managers.tab.markUnread).mockReturnValue(true);

    contextFor(['setUnread'], () => true, [], managers).setUnread('shell-1', true);

    expect(managers.tab.markUnread).toHaveBeenCalledWith('shell1');
    expect(armEscalation).toHaveBeenCalledWith(managers, 'shell1');
  });

  it('does not arm escalation for an ineligible tab or an unknown instance', () => {
    const { managers } = makeManagers();
    const tab = { label: 'shell1' };
    vi.mocked(managers.tab.pluginTabByInstanceKey).mockReturnValue(tab as never);

    contextFor(['setUnread'], () => true, [], managers).setUnread('shell-1', true);
    expect(armEscalation).not.toHaveBeenCalled();

    vi.mocked(managers.tab.pluginTabByInstanceKey).mockReturnValue(undefined);
    contextFor(['setUnread'], () => true, [], managers).setUnread('other-plugin-tab', true);
    expect(managers.tab.markUnread).toHaveBeenCalledTimes(1);
  });

  it('clears the badge and cancels its pending escalation', () => {
    const { managers } = makeManagers();
    vi.mocked(managers.tab.pluginTabByInstanceKey).mockReturnValue({ label: 'shell1' } as never);

    contextFor(['setUnread'], () => true, [], managers).setUnread('shell-1', false);

    expect(managers.tab.clearUnread).toHaveBeenCalledWith('shell1');
    expect(cancelEscalation).toHaveBeenCalledWith(managers, 'shell1');
  });
});

describe('setBusy', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('lights the dot on a plugin-owned tab and broadcasts the change', () => {
    const { managers } = makeManagers();
    const tab = { label: 'shell1', plugin: { id: 'fixture', instanceKey: 'shell-1' } as { busy?: boolean } };
    vi.mocked(managers.tab.pluginTabByInstanceKey).mockReturnValue(tab as never);
    const emit = vi.spyOn(messageBus, 'emit');

    contextFor(['setBusy'], () => true, [], managers).setBusy('shell-1', true);

    expect(managers.tab.pluginTabByInstanceKey).toHaveBeenCalledWith('fixture', 'shell-1');
    expect(tab.plugin.busy).toBe(true);
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });

  it('broadcasts nothing when the dot already shows the requested state', () => {
    const { managers } = makeManagers();
    vi.mocked(managers.tab.pluginTabByInstanceKey).mockReturnValue({ label: 'shell1', plugin: {} } as never);
    const emit = vi.spyOn(messageBus, 'emit');

    contextFor(['setBusy'], () => true, [], managers).setBusy('shell-1', false);

    expect(emit).not.toHaveBeenCalled();
  });

  it('ignores an instance key this plugin has no open tab for', () => {
    const { managers } = makeManagers();
    vi.mocked(managers.tab.pluginTabByInstanceKey).mockReturnValue(undefined);
    const emit = vi.spyOn(messageBus, 'emit');

    expect(() => contextFor(['setBusy'], () => true, [], managers).setBusy('gone', true)).not.toThrow();
    expect(emit).not.toHaveBeenCalled();
  });

  it('is refused to a plugin that did not declare it', () => {
    expect(() => contextFor(['note']).setBusy('shell-1', true))
      .toThrow('used capability "setBusy" without declaring it');
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

  it('asks the tab manager for an agent name only when the declaration does', () => {
    const { managers } = makeManagers();
    const openPluginTab = managers.tab.openPluginTab as unknown as ReturnType<typeof vi.fn>;
    const activation = activationFor();
    const named = createPluginContext(
      managers, { ...declaration(TAB_PLUGIN_CAPABILITY_NAMES), agentNamedTabs: true }, activation, origin, () => true,
    );
    const plain = createPluginContext(
      managers, declaration(TAB_PLUGIN_CAPABILITY_NAMES), activation, origin, () => true,
    );

    named.openOrFocusTab('one', () => ({ title: 'shell', payload: {} }));
    plain.openOrFocusTab('two', () => ({ title: 'shell', payload: {} }));

    expect(openPluginTab.mock.calls.map((call) => call.at(-1))).toEqual([true, false]);
  });

  it('queues a claimed open for the host rather than running it inside the guarded call', () => {
    const openRequests: string[] = [];
    const capabilities = contextFor(TAB_PLUGIN_CAPABILITY_NAMES, () => true, openRequests);
    capabilities.openClaimedFiles('~/clips/*.fixture');
    expect(openRequests).toEqual(['~/clips/*.fixture']);
  });

  it('opens a line in an editor tab through the ordinary edit pipeline', () => {
    const { managers } = makeManagers();
    const edit = vi.fn();
    (managers.openFile as unknown as { edit: unknown }).edit = edit;
    const capabilities = createPluginContext(
      managers, declaration(TAB_PLUGIN_CAPABILITY_NAMES), activationFor(), origin, () => true,
    );

    capabilities.openInEditor('/repo/src/a.ts', 42);

    expect(edit).toHaveBeenCalledWith(
      'fixture /repo/src/a.ts:42', '/repo/src/a.ts', 'janus', 42,
    );
  });

  it('refuses a line in a file outside the launch directory', () => {
    const { managers } = makeManagers();
    const edit = vi.fn();
    (managers.openFile as unknown as { edit: unknown }).edit = edit;
    const capabilities = createPluginContext(
      managers, declaration(TAB_PLUGIN_CAPABILITY_NAMES), activationFor(), origin, () => true,
    );

    // The capability is the plugin's whole reach over the filesystem, so the boundary lives here
    // rather than in each plugin that asks — a plugin holding one must not be able to name any
    // path on the machine and have it opened and served.
    capabilities.openInEditor('/etc/passwd', 1);
    capabilities.openInEditor('/repo/../etc/passwd', 1);
    capabilities.openInEditor('/repo-evil/a.ts', 1);

    expect(edit).not.toHaveBeenCalled();
  });

  it('does nothing for a revoked plugin asking to open a line', () => {
    const { managers } = makeManagers();
    const edit = vi.fn();
    (managers.openFile as unknown as { edit: unknown }).edit = edit;
    const capabilities = createPluginContext(
      managers, declaration(TAB_PLUGIN_CAPABILITY_NAMES), activationFor(), origin, () => false,
    );

    capabilities.openInEditor('/repo/src/a.ts', 42);

    expect(edit).not.toHaveBeenCalled();
  });

  it('serves the project file list the projectFiles RPC serves to quick open', async () => {
    const { managers } = makeManagers();
    (managers.tab as unknown as { launchDir: string }).launchDir = '/repo';
    const capabilities = createPluginContext(
      managers, declaration(TAB_PLUGIN_CAPABILITY_NAMES), activationFor(), origin, () => true,
    );

    const list = await capabilities.projectFileList();

    expect(list.root).toBe('/repo');
  });

  it('answers an empty file list to a revoked plugin rather than reading the project', async () => {
    const { managers } = makeManagers();
    (managers.tab as unknown as { launchDir: string }).launchDir = '/repo';
    const capabilities = createPluginContext(
      managers, declaration(TAB_PLUGIN_CAPABILITY_NAMES), activationFor(), origin, () => false,
    );

    expect(await capabilities.projectFileList()).toEqual({ root: '', paths: [] });
  });

  it('reads and saves settings under the declaring plugin\'s own id', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'context-settings-test-'));
    try {
      loadConfig(directory);
      const capabilities = contextFor(TAB_PLUGIN_CAPABILITY_NAMES);

      expect(capabilities.readSettings()).toEqual({});
      expect(capabilities.saveSettings({ regex: true })).toBe(true);

      expect(capabilities.readSettings()).toEqual({ regex: true });
      expect(getConfig().pluginSettings).toEqual({ fixture: { regex: true } });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('reads nothing and saves nothing for a revoked plugin', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'context-settings-test-'));
    try {
      loadConfig(directory);
      contextFor(TAB_PLUGIN_CAPABILITY_NAMES).saveSettings({ regex: true });
      const revoked = contextFor(TAB_PLUGIN_CAPABILITY_NAMES, () => false);

      expect(revoked.readSettings()).toEqual({});
      expect(revoked.saveSettings({ regex: false })).toBe(false);
      expect(getConfig().pluginSettings).toEqual({ fixture: { regex: true } });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('treats settings that are not a plain JSON object as a plugin bug', () => {
    const capabilities = contextFor(TAB_PLUGIN_CAPABILITY_NAMES);

    for (const value of [null, ['regex'], 'regex', { size: NaN }]) {
      expect(() => capabilities.saveSettings(value as never))
        .toThrow('saved settings that are not a JSON object');
    }
  });

  it('reports a thrown non-Error as a failure without losing what it said', () => {
    const capabilities = contextFor(TAB_PLUGIN_CAPABILITY_NAMES);
    expect(() => capabilities.reportFailure('plain string reason')).toThrow('plain string reason');
    expect(() => capabilities.reportFailure(new Error('already an error')))
      .toThrow('already an error');
  });
});
