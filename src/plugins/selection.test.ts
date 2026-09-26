import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { TabManager } from '../tab/manager.js';
import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginActivation,
  type TabPluginDeclaration,
} from './api.js';
import { TabPluginHost } from './host.js';
import { runPluginSelectionAction } from './selection.js';
import { NotificationQueue } from '../notifications/queue.js';

function manifest(contributed = true): TabPluginDeclaration {
  return {
    id: 'fixture',
    version: '1.0.0',
    apiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: 1,
    tabLabelPrefix: 'fixture',
    fileExtensions: { '.fixture': 'text/plain' },
    ...(contributed && { selectionAction: { label: 'Add to playlist', action: 'queue' } }),
    capabilities: ['openClaimedFiles', 'note'],
  };
}

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.notifications = new NotificationQueue();
  managers.tab = new TabManager(managers);
  Object.assign(managers, {
    openFile: { runAs: vi.fn(async () => {}) },
  } as unknown as Managers);
  return managers;
}

function hostFor(
  managers: Managers,
  activation: Partial<TabPluginActivation>,
  declaration: TabPluginDeclaration = manifest(),
): TabPluginHost {
  return new TabPluginHost(managers, [declaration], {
    fixture: async () => ({
      activate: () => ({
        isPayload: () => true,
        intent: () => null,
        opener: { external: () => {}, inline: () => {} },
        ...activation,
      }),
    }),
  });
}

function origin(managers: Managers) {
  return { label: managers.tab.tabs[0].label, command: 'Add to playlist' };
}

describe('running a contributed selection action', () => {
  it('hands the resolved absolute paths to the plugin handler', async () => {
    const managers = makeManagers();
    const selectionAction = vi.fn();
    const host = hostFor(managers, { selectionAction });

    await host.runSelectionAction('fixture', 'queue', ['/m/a.fixture', '/m/b.fixture'], origin(managers));

    expect(selectionAction).toHaveBeenCalledOnce();
    expect(selectionAction.mock.calls[0][0]).toEqual(['/m/a.fixture', '/m/b.fixture']);
  });

  it('runs every openClaimedFiles target the handler queued, pinned to its own opener', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, {
      selectionAction: (paths, capabilities) => {
        for (const file of paths) capabilities.openClaimedFiles(file);
      },
    });

    await host.runSelectionAction('fixture', 'queue', ['/m/a.fixture'], origin(managers));

    expect(managers.openFile.runAs).toHaveBeenCalledWith(
      'open /m/a.fixture', 'Add to playlist', managers.tab.tabs[0].label, 'fixture',
    );
  });

  // The label is drawn from the declaration alone, so an entry with nothing behind it would reach
  // the user before anything could discover it does not run — caught at activation instead.
  it('disables a plugin whose declaration contributes an entry with no handler', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, {});

    await host.runSelectionAction('fixture', 'queue', ['/m/a.fixture'], origin(managers));

    expect(host.statusFor('fixture')?.state).toBe('disabled');
    expect(host.statusFor('fixture')?.reason)
      .toContain('contributes "Add to playlist" but provides no selectionAction handler');
  });

  it('activates happily when neither the declaration nor the activation carries one', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, {}, manifest(false));

    await host.runOpener('fixture', 'inline', '/m/a.fixture', origin(managers));

    expect(host.statusFor('fixture')?.state).toBe('active');
  });

  // A rejection answers one bad request and leaves the plugin running; there is no waiting client,
  // so it lands in the transcript of the tab the menu was opened from.
  it('rejects an action name the declaration does not carry without disabling the plugin', async () => {
    const managers = makeManagers();
    const selectionAction = vi.fn();
    const host = hostFor(managers, { selectionAction });

    await host.runSelectionAction('fixture', 'shuffle', ['/m/a.fixture'], origin(managers));

    expect(selectionAction).not.toHaveBeenCalled();
    expect(host.statusFor('fixture')?.state).toBe('active');
    expect(managers.tab.tabs[0].log.at(-1)?.output)
      .toContain('contributes no selection action "shuffle"');
  });

  it('disables the plugin when its handler throws', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, {
      selectionAction: () => { throw new Error('handler broke'); },
    });

    await host.runSelectionAction('fixture', 'queue', ['/m/a.fixture'], origin(managers));

    expect(host.statusFor('fixture')?.state).toBe('disabled');
    expect(host.statusFor('fixture')?.reason).toContain('handler broke');
  });

  it('does nothing at all for a plugin id the host does not hold', async () => {
    const managers = makeManagers();
    const host = hostFor(managers, { selectionAction: vi.fn() });

    await expect(host.runSelectionAction('nobody', 'queue', ['/m/a.fixture'], origin(managers)))
      .resolves.toBeUndefined();
  });
});

// The clientless half of the same action: the default context menu's entry and the file navigator's
// selection action both send their request and move on, so this path runs the same dispatch under the
// host's call budget and records what came back instead of throwing to a waiting socket.
describe('running a selection action with no client waiting', () => {
  const manifest = () => ({
    id: 'fixture',
    selectionAction: { label: 'Add to playlist', action: 'queue' },
  });
  const origin = { label: 'files', command: 'Add to playlist' };

  function clientlessPort(handler?: () => void) {
    const tabs = [{ label: 'files', log: [] as { output?: string }[] }];
    const append = vi.fn((_label: string, entry: { output?: string }) => { tabs[0].log.push(entry); });
    return {
      managers: { tab: { tabs, append } },
      record: (id: string) => (id === 'fixture' ? { declaration: manifest(), id } : undefined),
      ensureActive: vi.fn(async () => (handler ? { selectionAction: handler } : {})),
      // Modelled on the real port's call budget: a dispatch that rejects comes back as a `rejected`
      // outcome carrying the reason, which is what the entry then notes in the originating tab. It
      // never propagates, because there is no socket to answer.
      invoke: vi.fn(async (_record: unknown, _activation: unknown, _origin: unknown, run: (c: unknown) => unknown) => {
        try {
          await run({});
          return { status: 'ok' };
        } catch (error) {
          return { status: 'rejected', reason: error instanceof Error ? error.message : String(error) };
        }
      }),
      disable: vi.fn(),
      tabs,
      append,
    };
  }

  it('hands the paths to the handler', async () => {
    const handler = vi.fn();
    const port = clientlessPort(handler);

    await runPluginSelectionAction(port as never, 'fixture', 'queue', ['/m/a.fixture'], origin);

    expect(handler).toHaveBeenCalledExactlyOnceWith(['/m/a.fixture'], expect.anything());
    expect(port.disable).not.toHaveBeenCalled();
  });

  // The declaration claims the action, so the first guard passes, and the activation carries none.
  // The client path never reaches this state — it refuses to activate such a plugin at all — but the
  // clientless path has no such screen, so this guard is the only thing standing there.
  it('rejects a declaration whose activation provides no handler, in the originating tab', async () => {
    const port = clientlessPort();

    await runPluginSelectionAction(port as never, 'fixture', 'queue', ['/m/a.fixture'], origin);

    expect(port.disable).not.toHaveBeenCalled();
    expect(port.tabs[0].log.at(-1)?.output)
      .toContain('contributes a selection action but provides no handler');
  });

  it('does nothing for a plugin id the port does not hold', async () => {
    const port = clientlessPort(vi.fn());
    await expect(runPluginSelectionAction(port as never, 'nobody', 'queue', [], origin))
      .resolves.toBeUndefined();
    expect(port.ensureActive).not.toHaveBeenCalled();
  });
});
