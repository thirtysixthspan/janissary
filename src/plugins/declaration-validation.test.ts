import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { TabManager } from '../tab/manager.js';
import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginActivation,
  type TabPluginDeclaration,
  type TabPluginHostStateSlice,
} from './api.js';
import { TabPluginHost } from './host.js';
import { NotificationQueue } from '../notifications/queue.js';

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.notifications = new NotificationQueue();
  managers.tab = new TabManager(managers);
  Object.assign(managers, {
    shell: { closeTab: vi.fn() },
    schedule: { closeTab: vi.fn(), view: () => [] },
    connection: { connectionsFor: () => [] },
    pty: { closeTab: vi.fn(), spawnDimensions: () => ({ cols: 80, rows: 24 }) },
  } as unknown as Partial<Managers>);
  return managers;
}

function manifest(overrides: Partial<TabPluginDeclaration> = {}): TabPluginDeclaration {
  return {
    id: 'fixture', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION, payloadSchemaVersion: 1,
    tabLabelPrefix: 'fixture', fileExtensions: { '.fixture': 'text/plain' },
    capabilities: ['note', 'openOrFocusTab', 'updateTab', 'rejectRequest', 'reportFailure'],
    ...overrides,
  };
}

function activation(overrides: Partial<TabPluginActivation> = {}): TabPluginActivation {
  return {
    isPayload: () => true,
    intent: () => null,
    opener: {
      external: () => {},
      inline: (file, capabilities) => {
        capabilities.openOrFocusTab(file, () => ({ title: 'fixture', payload: { file } }));
      },
    },
    ...overrides,
  };
}

async function activateWith(declaration: TabPluginDeclaration, result: TabPluginActivation) {
  const managers = makeManagers();
  const host = new TabPluginHost(managers, [declaration], { fixture: async () => ({ activate: () => result }) });
  await host.runOpener('fixture', 'inline', '/tmp/a.fixture', {
    label: managers.tab.tabs[0].label, command: 'open /tmp/a.fixture',
  });
  return host;
}

describe('host state declaration validation', () => {
  const slices: TabPluginHostStateSlice[] = ['connections', 'schedule'];

  it('refuses a slice that is not one the host knows', async () => {
    const host = await activateWith(
      manifest({ hostState: ['transcript' as TabPluginHostStateSlice] }),
      activation({ hostState: () => {} }),
    );

    expect(host.statusFor('fixture')?.state).toBe('disabled');
    expect(host.statusFor('fixture')?.reason).toContain('unknown host state slice "transcript"');
  });

  // Host state is pushed from the declaration alone, so a slice nothing consumes would leave the
  // payload permanently short of what it declared it wanted — caught at activation, like a topic with
  // no notify handler.
  it('refuses a slice with no handler behind it', async () => {
    const host = await activateWith(manifest({ hostState: slices }), activation());

    expect(host.statusFor('fixture')?.state).toBe('disabled');
    expect(host.statusFor('fixture')?.reason)
      .toContain('requests "connections", "schedule" but provides no hostState handler');
  });

  it('accepts a slice with a handler behind it', async () => {
    const host = await activateWith(
      manifest({ hostState: slices }),
      activation({ hostState: () => {} }),
    );

    expect(host.statusFor('fixture')?.state).toBe('active');
  });

  it('accepts a declaration that asks for no host state at all', async () => {
    const host = await activateWith(manifest(), activation());

    expect(host.statusFor('fixture')?.state).toBe('active');
  });
});

describe('chord claim validation', () => {
  it('accepts the canonical ids the application\'s own table uses', async () => {
    const host = await activateWith(
      manifest({ chords: ['ctrl+r', 'meta+shift+f', 'shift+tab', 'alt+1'] }),
      activation(),
    );

    expect(host.statusFor('fixture')?.state).toBe('active');
  });

  // A chord id is compared against the application's table by string, so a typo is a claim that can
  // never fire — which is the plugin's own mistake to hear about, not a key silently doing nothing.
  it('refuses a chord id that is not in the canonical shape', async () => {
    for (const chord of ['Ctrl+R', 'ctrl-', 'ctrl++', '']) {
      const host = await activateWith(manifest({ chords: [chord] }), activation());
      expect(host.statusFor('fixture')?.state).toBe('disabled');
      expect(host.statusFor('fixture')?.reason).toContain(`claims malformed chord id "${chord}"`);
    }
  });

  it('accepts a declaration that claims no chord', async () => {
    const host = await activateWith(manifest(), activation());

    expect(host.statusFor('fixture')?.state).toBe('active');
  });
});