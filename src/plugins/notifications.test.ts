import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { TabManager } from '../tab/manager.js';
import { messageBus } from '../bus.js';
import {
  TAB_PLUGIN_API_VERSION,
  type AggregatedScheduleView,
  type TabPluginActivation,
  type TabPluginDeclaration,
  type TabPluginNotification,
} from './api.js';
import { TabPluginHost } from './host.js';

const ROWS: AggregatedScheduleView[] = [
  { tab: 'janus', id: 's1', spec: 'every 5m', next: 'in 5m', recurring: true, command: 'ls' },
];

function manifest(id: string, notifications?: readonly 'schedules'[]): TabPluginDeclaration {
  return {
    id, version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION, payloadSchemaVersion: 1,
    tabLabelPrefix: id, fileExtensions: { [`.${id}`]: 'text/plain' },
    ...(notifications && { notifications }),
    capabilities: ['note', 'openOrFocusTab', 'updateTab'],
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
    schedule: { delete: vi.fn(), aggregatedView: () => ROWS },
    questions: { cancelTab: vi.fn(), pendingFor: vi.fn() },
    database: { forgetTab: vi.fn(), closeAll: vi.fn() },
  } as unknown as Managers);
  return managers;
}

function activationFor(notify?: TabPluginActivation['notify']): TabPluginActivation {
  return {
    isPayload: () => true,
    intent: () => null,
    opener: {
      external: () => {},
      inline: (file, capabilities) => {
        capabilities.openOrFocusTab(file, () => ({ title: 'fixture', payload: { file } }));
      },
    },
    ...(notify && { notify }),
  };
}

// Nothing is awaited on a notification — the host fans out and moves on — so a test observes one by
// waiting for the delivery its handler performs rather than by awaiting the emit.
function fireSchedules(): Promise<void> {
  messageBus.emit('schedules', { type: 'changed' });
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

async function openTab(host: TabPluginHost, managers: Managers, id = 'fixture') {
  await host.runOpener(id, 'inline', `/tmp/a.${id}`, {
    label: managers.tab.tabs[0].label, command: `open /tmp/a.${id}`,
  });
  return managers.tab.tabs.find((tab) => tab.plugin?.id === id)!;
}

describe('tab plugin notifications', () => {
  it('delivers the current rows and the plugin\'s own instance keys', async () => {
    const managers = makeManagers();
    const seen: TabPluginNotification[] = [];
    const host = new TabPluginHost(managers, [manifest('fixture', ['schedules'])], {
      fixture: async () => ({ activate: () => activationFor((event) => { seen.push(event); }) }),
    });
    await openTab(host, managers);

    await fireSchedules();

    expect(seen).toEqual([{ topic: 'schedules', data: ROWS, tabs: ['/tmp/a.fixture'] }]);
  });

  it('never reaches a subscriber with no open tab, and never activates one', async () => {
    const managers = makeManagers();
    const notify = vi.fn();
    const loader = vi.fn(async () => ({ activate: () => activationFor(notify) }));
    const host = new TabPluginHost(managers, [manifest('fixture', ['schedules'])], { fixture: loader });

    await fireSchedules();

    expect(notify).not.toHaveBeenCalled();
    expect(loader).not.toHaveBeenCalled();
    expect(host.statusFor('fixture')?.state).toBe('declared');
  });

  it('never reaches a plugin that did not declare the topic', async () => {
    const managers = makeManagers();
    const notify = vi.fn();
    const host = new TabPluginHost(managers, [manifest('fixture')], {
      fixture: async () => ({ activate: () => activationFor(notify) }),
    });
    await openTab(host, managers);

    await fireSchedules();

    expect(notify).not.toHaveBeenCalled();
  });

  it('never reaches a disabled plugin', async () => {
    const managers = makeManagers();
    const notify = vi.fn();
    const host = new TabPluginHost(managers, [manifest('fixture', ['schedules'])], {
      fixture: async () => ({ activate: () => activationFor(notify) }),
    });
    const tab = await openTab(host, managers);
    host.clientFailed(tab.label, 'client gave up');

    await fireSchedules();

    expect(notify).not.toHaveBeenCalled();
  });

  it('disables only the plugin whose handler throws', async () => {
    const managers = makeManagers();
    const healthy = vi.fn();
    const host = new TabPluginHost(
      managers,
      [manifest('broken', ['schedules']), manifest('fixture', ['schedules'])],
      {
        broken: async () => ({
          activate: () => activationFor(() => { throw new Error('handler blew up'); }),
        }),
        fixture: async () => ({ activate: () => activationFor(healthy) }),
      },
    );
    await openTab(host, managers, 'broken');
    await openTab(host, managers, 'fixture');

    await fireSchedules();

    expect(host.statusFor('broken')?.state).toBe('disabled');
    expect(host.statusFor('broken')?.reason).toContain('handler blew up');
    expect(host.statusFor('fixture')?.state).toBe('active');
    expect(healthy).toHaveBeenCalledOnce();
  });

  it('disables a handler that exceeds its budget', async () => {
    const managers = makeManagers();
    const host = new TabPluginHost(managers, [manifest('slow', ['schedules'])], {
      slow: async () => ({
        activate: () => activationFor(async () => {
          await new Promise((resolve) => { setTimeout(resolve, 60); });
        }),
      }),
    }, { notifyTimeoutMs: 5 });
    await openTab(host, managers, 'slow');

    messageBus.emit('schedules', { type: 'changed' });
    await new Promise((resolve) => { setTimeout(resolve, 30); });

    expect(host.statusFor('slow')?.state).toBe('disabled');
    expect(host.statusFor('slow')?.reason).toContain('timed out');
  });

  it('ignores whatever the handler returns', async () => {
    const managers = makeManagers();
    const host = new TabPluginHost(managers, [manifest('fixture', ['schedules'])], {
      fixture: async () => ({
        activate: () => activationFor(() => 'ignored' as unknown as void),
      }),
    });
    await openTab(host, managers);

    await fireSchedules();

    expect(host.statusFor('fixture')?.state).toBe('active');
  });

  it('writes no transcript line when a handler calls note', async () => {
    const managers = makeManagers();
    const host = new TabPluginHost(managers, [manifest('fixture', ['schedules'])], {
      fixture: async () => ({
        activate: () => activationFor((_event, capabilities) => { capabilities.note('background'); }),
      }),
    });
    await openTab(host, managers);
    const before = managers.tab.tabs.map((tab) => tab.log.length);

    await fireSchedules();

    expect(managers.tab.tabs.map((tab) => tab.log.length)).toEqual(before);
  });

  it('disables a plugin that subscribes but supplies no notify handler', async () => {
    const managers = makeManagers();
    const host = new TabPluginHost(managers, [manifest('fixture', ['schedules'])], {
      fixture: async () => ({ activate: () => activationFor() }),
    });

    await host.runOpener('fixture', 'inline', '/tmp/a.fixture', { label: 'janus', command: 'open' });

    expect(host.statusFor('fixture')?.state).toBe('disabled');
    expect(host.statusFor('fixture')?.reason).toContain('subscribes to "schedules" but provides no notify handler');
  });

  it('stops delivering once the host is disposed', async () => {
    const managers = makeManagers();
    const notify = vi.fn();
    const host = new TabPluginHost(managers, [manifest('fixture', ['schedules'])], {
      fixture: async () => ({ activate: () => activationFor(notify) }),
    });
    await openTab(host, managers);
    host.dispose();

    await fireSchedules();

    expect(notify).not.toHaveBeenCalled();
  });

  it('leaves the new rows in the tab when the handler answers with updateTab', async () => {
    const managers = makeManagers();
    const host = new TabPluginHost(managers, [manifest('fixture', ['schedules'])], {
      fixture: async () => ({
        activate: () => activationFor((event, capabilities) => {
          for (const key of event.tabs) {
            capabilities.updateTab(key, () => ({ payload: { rows: event.data } }));
          }
        }),
      }),
    });
    const tab = await openTab(host, managers);

    await fireSchedules();

    expect(tab.plugin!.payload).toEqual({ rows: ROWS });
  });
});
