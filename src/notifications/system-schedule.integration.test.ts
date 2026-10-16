import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createController, type Controller } from '../controller.js';
import { getConfig, loadConfig, updateConfig } from '../config.js';
import type { ClientMessage } from '../protocol.js';
import type { NativeNotificationEvent } from '../protocol/events.js';
import { handle } from '../message/handler.js';
import { initNotificationRecord, notificationRecordPath } from './record.js';
import { openNotificationsTab, notificationsTab } from './tab.js';
import { seedRootTab, seedTestTab } from '../tab/root-tab-test-fixture.js';
import {
  notifySystemScheduleRun,
  notifySystemShellStartFailure,
} from '../schedule/system/notices.js';

describe('system schedule notification delivery', () => {
  let projectDir: string;
  let controller: Controller;
  let toasts: Array<{ from: string; message: string; color?: string }>;
  let native: Array<Omit<NativeNotificationEvent, 't'>>;

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(tmpdir(), 'system-schedule-notification-'));
    loadConfig(projectDir);
    initNotificationRecord(projectDir);
    toasts = [];
    native = [];
    controller = createController({
      emitState: () => {},
      sendPty: () => {},
      sendPtyExit: () => {},
      sendToast: (event) => { toasts.push(event); },
      sendNativeNotification: (event) => { native.push(event); },
    }, projectDir);
    seedRootTab(controller.managers.tab);
  });

  afterEach(async () => {
    await controller.shutdown();
    initNotificationRecord();
    rmSync(projectDir, { recursive: true, force: true });
  });

  function focusTab(label: string): void {
    const message = { id: 1, method: 'focusTab', params: { label } } as ClientMessage;
    const replies: unknown[] = [];
    handle(controller, message, (event) => { replies.push(event); });
    expect(replies).toEqual([{ t: 'rpc-reply', id: 1, result: 'ok' }]);
  }

  it('delivers an enabled notice through the queue, record, toast, native bus, feed link, and focus RPC', () => {
    const manager = controller.managers.tab;
    const system = seedTestTab(manager, 'system');
    system.systemShell = true;
    manager.userCloseTab(manager.findIndex('system'));
    expect(system.hidden).toBe(true);
    expect(manager.cur().label).toBe('janus');

    notifySystemScheduleRun(controller.managers, 'nightly', 'deploy');

    const message = 'System schedule nightly ran: script deploy';
    expect(controller.managers.notifications.all).toHaveLength(1);
    expect(controller.managers.notifications.all[0]).toMatchObject({
      event: 'system-schedule-fire', tabLabel: 'system', message, openTab: 'system',
    });
    expect(toasts).toEqual([{ from: 'system', message, color: system.dotColor }]);
    expect(native).toEqual([expect.objectContaining({
      tab: 'system', from: 'system', message, category: 'warning', desktop: true,
    })]);
    expect(JSON.parse(readFileSync(notificationRecordPath(), 'utf8'))).toMatchObject({
      event: 'system-schedule-fire', tab: 'system', message, openTab: 'system',
    });

    focusTab('system');
    expect(manager.cur().label).toBe('system');
    expect(system.hidden).toBeUndefined();
    openNotificationsTab(controller.managers);
    expect(notificationsTab(controller.managers)?.log[0]?.openTab).toBe('system');
  });

  it('does not queue, record, toast, or alert when the system schedule toggle is disabled', () => {
    const events = getConfig().notifications?.events;
    if (!events) throw new Error('notification defaults were not loaded');
    expect(updateConfig({ notifications: { events: { ...events, systemScheduleFire: false } } })).toBe(true);

    notifySystemScheduleRun(controller.managers, 'nightly', 'deploy');

    expect(controller.managers.notifications.all).toEqual([]);
    expect(existsSync(notificationRecordPath())).toBe(false);
    expect(toasts).toEqual([]);
    expect(native).toEqual([]);
    expect(managerLabels()).not.toContain('notifications');
  });

  it('holds a startup failure before a system tab exists without creating one', () => {
    notifySystemShellStartFailure(controller.managers, new Error('zsh unavailable'));

    expect(controller.managers.notifications.all[0]).toMatchObject({
      event: 'system-schedule-fire', tabLabel: 'system',
      message: 'System shell could not start: zsh unavailable.', openTab: 'system',
    });
    expect(JSON.parse(readFileSync(notificationRecordPath(), 'utf8'))).toMatchObject({
      tab: 'system', message: 'System shell could not start: zsh unavailable.', openTab: 'system',
    });
    expect(managerLabels()).toEqual(['janus']);

    focusTab('system');
    expect(controller.managers.tab.cur().label).toBe('janus');
    expect(managerLabels()).toEqual(['janus']);
  });

  function managerLabels(): string[] {
    return controller.managers.tab.tabs.map((tab) => tab.label);
  }
});
