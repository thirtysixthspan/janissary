import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import {
  TAB_PLUGIN_API_VERSION,
  TAB_PLUGIN_CAPABILITY_NAMES,
  type TabPluginActivation,
  type TabPluginDeclaration,
} from './api.js';
import { createPluginContext } from './context.js';
import { TabManager } from '../tab/manager.js';

// The launch origin is how the application opens its launch shell before any tab exists: an origin
// whose label names the tab to open rather than a tab to open it from.
const launch = { label: 'janus', command: 'zsh', launch: true } as const;

const declaration: TabPluginDeclaration = {
  id: 'fixture', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: 1, tabLabelPrefix: 'fixture', fileExtensions: {},
  capabilities: TAB_PLUGIN_CAPABILITY_NAMES, agentNamedTabs: true,
};

const activation: TabPluginActivation = {
  isPayload: () => true, intent: () => null, opener: { inline: () => {}, external: () => {} },
};

function emptyManagers(): Managers {
  return {
    tab: {
      tabs: [], launchDir: '/repo', openPluginTab: vi.fn(), byLabel: vi.fn(), cwdOf: vi.fn(),
    },
  } as unknown as Managers;
}

describe('a launch origin', () => {
  it('answers originTab with the project root although no tab carries its label', () => {
    const capabilities = createPluginContext(emptyManagers(), declaration, activation, launch, () => true);

    expect(capabilities.originTab()).toEqual({ label: 'janus', cwd: '/repo', root: '/repo' });
  });

  it('opens its tab with no origin tab, under the launch label rather than an agent-pool name', () => {
    const managers = emptyManagers();
    const capabilities = createPluginContext(managers, declaration, activation, launch, () => true);

    capabilities.openOrFocusTab('shell-1', () => ({ title: 'shell', payload: {} }));

    const openPluginTab = managers.tab.openPluginTab as unknown as ReturnType<typeof vi.fn>;
    expect(openPluginTab).toHaveBeenCalledOnce();
    expect(openPluginTab.mock.calls[0].at(-1)).toEqual({ label: 'janus' });
  });

  it('still answers null for an ordinary origin whose tab is gone', () => {
    const capabilities = createPluginContext(
      emptyManagers(), declaration, activation, { label: 'janus', command: 'zsh' }, () => true,
    );

    expect(capabilities.originTab()).toBeNull();
  });
});

describe('TabManager.openPluginTab with a fixed label', () => {
  it('names the first tab outright, in the first palette colour and group 1', () => {
    const managers = { sessions: { view: () => [] } } as unknown as Managers;
    managers.tab = new TabManager(managers, '/repo');

    managers.tab.openPluginTab(
      'fixture', 'fixture', 'shell-1', 1, 'janus', () => ({ title: 'shell', payload: {} }), { label: 'janus' },
    );

    expect(managers.tab.tabs).toHaveLength(1);
    expect(managers.tab.tabs[0]).toMatchObject({
      label: 'janus', title: 'janus', dotColor: '#5b9cff', group: 1, groupColor: '#5b9cff', view: 'plugin',
    });
    expect(managers.tab.activeTab).toBe(0);
  });
});
