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
import { createPluginContext } from './context.js';
import { TabPluginHost } from './host.js';

const origin = { label: 'janus', command: 'fixture' };

function declaration(capabilities: readonly TabPluginCapabilityName[]): TabPluginDeclaration {
  return {
    id: 'fixture', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: 1, tabLabelPrefix: 'fixture', fileExtensions: { '.fixture': 'text/plain' },
    capabilities,
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

function contextFor(capabilities: readonly TabPluginCapabilityName[]): TabPluginServerCapabilities {
  const activation: TabPluginActivation = {
    isPayload: () => true, intent: () => null, opener: { inline: () => {}, external: () => {} },
  };
  return createPluginContext(
    makeManagers().managers, declaration(capabilities), activation, origin, () => true,
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
