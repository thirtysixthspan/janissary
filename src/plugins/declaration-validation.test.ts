import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { shellManifest } from './shell/manifest.js';
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
    for (const chord of [
      'Ctrl+R', 'ctrl-', 'ctrl++', '', 'shift+ctrl+r', 'alt+shift+r', 'ctrl+ctrl+r', 'meta+meta+f',
    ]) {
      const host = await activateWith(manifest({ chords: [chord] }), activation());
      expect(host.statusFor('fixture')?.state).toBe('disabled');
      expect(host.statusFor('fixture')?.reason).toContain(`claims malformed chord id "${chord}"`);
    }
  });

  it('accepts every chord the bundled shell manifest claims', async () => {
    const host = await activateWith(manifest({ chords: shellManifest.chords }), activation());

    expect(shellManifest.chords).toEqual(['ctrl+r', 'meta+t']);
    expect(host.statusFor('fixture')?.state).toBe('active');
  });

  it('accepts a declaration that claims no chord', async () => {
    const host = await activateWith(manifest(), activation());

    expect(host.statusFor('fixture')?.state).toBe('active');
  });
});

// The failure mode this covers is silent and total: a capability an activation calls but its
// declaration does not name is not refused at activation, it is replaced by a stub that throws — and
// the plugin is then disabled the first time it is reached, which for a command means the command
// opens nothing at all. Nothing in the declaration is wrong, so no validation can see it; only a test
// that compares what the activation uses against what the manifest declares can.
describe('the shell plugin declares every capability its activation reaches for', () => {
  it('covers each capability named in activate.ts and open-tab.ts', () => {
    const declared = new Set<string>(shellManifest.capabilities);
    // Read out of the activation's own source rather than restated here, so a capability added to the
    // plugin is covered by this the moment it is written rather than by a second edit here.
    const source = readFileSync(
      new URL('shell/activate.ts', import.meta.url), 'utf8',
    ) + readFileSync(new URL('shell/open-tab.ts', import.meta.url), 'utf8');

    const used = new Set([...source.matchAll(/capabilities\.([a-zA-Z]+)\(/g)].map((match) => match[1]));
    expect(used.size).toBeGreaterThan(0);
    expect(used.difference(declared)).toEqual(new Set());
  });

  it('declares the capability the mount-time status question asks about', () => {
    // Named separately because it is the one whose absence is invisible until a user opens a tab.
    expect(shellManifest.capabilities).toContain('terminalRunning');
  });
});
