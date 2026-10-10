import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../../managers.js';
import { NotificationQueue } from '../../notifications/queue.js';
import { TabManager } from '../../tab/manager.js';
import { seedRootTab } from '../../tab/root-tab-test-fixture.js';
import { TabPluginHost } from '../host.js';
import { launcherManifest } from './manifest.js';
import { activate } from './activate.js';
import { isLauncherPayload } from './shared.js';

function managersWithTabLifecycle(): Managers {
  const managers = {} as Managers;
  managers.notifications = new NotificationQueue();
  managers.tab = new TabManager(managers, process.cwd());
  seedRootTab(managers.tab);
  Object.assign(managers, {
    workspace: { remove: vi.fn(), cancel: vi.fn() },
    shell: { close: vi.fn(), closeTab: vi.fn() },
    acp: {
      start: vi.fn(() => ({ session: 'launcher-test-session' })),
      promptResult: vi.fn(async (_label: string, prompt: string) => ({
        answered: true,
        reply: prompt.includes('These are the tabs currently open')
          ? '[[tab:janus]] Running the lifecycle test.'
          : '',
        session: 'launcher-test-session',
      })),
      close: vi.fn(), closeTab: vi.fn(),
    },
    browser: { closeTab: vi.fn() }, pty: { closeTab: vi.fn() }, harness: { closeTab: vi.fn() },
    fileNavigator: { closeTab: vi.fn() }, editorWatch: { closeTab: vi.fn(), watch: vi.fn() },
    editorAcp: { closeTab: vi.fn() }, schedule: { delete: vi.fn(), closeTab: vi.fn() },
    questions: { cancelTab: vi.fn(), closeTab: vi.fn(), pendingFor: vi.fn() },
    communication: { closeTab: vi.fn() }, command: { closeTab: vi.fn() },
    database: { forgetTab: vi.fn(), closeTab: vi.fn(), closeAll: vi.fn() }, remote: { closeTab: vi.fn() },
  } as unknown as Managers);
  return managers;
}

describe('launcher singleton tab lifecycle', () => {
  it('clears summary state when the real tab is closed and its singleton is created again', async () => {
    const managers = managersWithTabLifecycle();
    const host = new TabPluginHost(managers, [launcherManifest], {
      launcher: async () => ({ activate }),
    });
    const origin = { label: 'janus', command: 'launcher' };

    await host.runCommand('launcher', 'launcher', origin);
    let launcherTab = managers.tab.tabs.find((tab) => tab.plugin?.instanceKey === 'launcher');
    if (!launcherTab) throw new Error('launcher tab was not opened');
    await host.intent(launcherTab.label, 'summarize', {});
    const firstPayload = launcherTab.plugin?.payload;
    if (!isLauncherPayload(firstPayload)) throw new Error('launcher payload was rejected');
    expect(firstPayload.summaries.janus).toBe('Running the lifecycle test.');

    const launcherIndex = managers.tab.tabs.findIndex((tab) => tab.label === launcherTab.label);
    managers.tab.setDock(launcherIndex, null);
    managers.tab.closeTab(launcherIndex);
    expect(managers.tab.tabs.map((tab) => [tab.label, tab.dock, tab.runtime?.closing])).toEqual([
      ['janus', undefined, undefined],
    ]);
    await host.runCommand('launcher', 'launcher', origin);

    launcherTab = managers.tab.tabs.find((tab) => tab.plugin?.instanceKey === 'launcher');
    if (!launcherTab) throw new Error('launcher tab was not recreated');
    const reopenedPayload = launcherTab.plugin?.payload;
    if (!isLauncherPayload(reopenedPayload)) throw new Error('reopened launcher payload was rejected');
    expect(reopenedPayload.summaries).toEqual({});

    host.dispose();
    managers.tab.dispose();
  });
});
