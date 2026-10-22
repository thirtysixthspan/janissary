import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { NativeNotificationEvent } from '../protocol/events.js';
import * as config from '../config.js';
import { messageBus } from '../bus.js';
import { notify, EXPLICIT_EVENTS, AMBIENT_EVENTS } from './index.js';
import { NotificationQueue } from './queue.js';
import { fakeNotificationsHost } from './tab-test-fixture.js';
import { initNotificationRecord } from './record.js';
import { NOTIFICATION_ALERT_DEFAULTS } from './alert-defaults.js';

function setup() {
  const tabs: Array<{ label: string; title?: string; log: unknown[]; view?: string; dock?: 'right' }> = [
    { label: 'janus', title: 'Launch', log: [] },
    { label: 'build', title: 'Build agent', log: [] },
  ];
  const managers = {
    tab: {
      tabs,
      cur: () => tabs[0],
      append: vi.fn(),
      ...fakeNotificationsHost(tabs),
    },
    notifications: new NotificationQueue(),
  } as unknown as Managers;
  const events: NativeNotificationEvent[] = [];
  const subscription = messageBus.on('notifications', 'native-notification', (event) => {
    if (event.type === 'native-notification') {
      events.push({ t: 'native-notification', ...event });
    }
  });
  return { managers, tabs, events, dispose: () => subscription.unsubscribe() };
}

afterEach(() => {
  vi.restoreAllMocks();
  initNotificationRecord();
});

describe('native notification delivery', () => {
  it('emits an eligible event with server-owned settings and tab identity even when the feed is visible', () => {
    const fixture = setup();
    try {
      const defaults = config.getConfig();
      vi.spyOn(config, 'getConfig').mockReturnValue({
        ...defaults, osNotifications: true, terminalBell: true,
        terminalBellVolumeWarning: 0.4,
      });
      notify(fixture.managers, 'question', 'build', 'Please review', { openTab: 'build' });
      expect(fixture.events).toEqual([expect.objectContaining({
        tab: 'build', from: 'Build agent', category: 'warning', desktop: true, volume: 0.4,
      })]);
      fixture.tabs.push({ label: 'notifications', view: 'notifications', log: [] });
      notify(fixture.managers, 'manual', 'build', 'Done');
      expect(fixture.events[1]).toMatchObject({ category: 'success', message: 'Done' });
    } finally { fixture.dispose(); }
  });

  it('lets the client decide focused-window suppression even for the selected tab', () => {
    const fixture = setup();
    try {
      notify(fixture.managers, 'manual', 'janus', 'Done');
      expect(fixture.events).toHaveLength(1);
    } finally { fixture.dispose(); }
  });

  it('respects per-type alerts, both master switches, and cue volume', () => {
    const fixture = setup();
    try {
      const defaults = config.getConfig();
      const getConfig = vi.spyOn(config, 'getConfig');
      getConfig.mockReturnValue({ ...defaults, osNotifications: false, terminalBell: false });
      notify(fixture.managers, 'manual', 'build', 'First');
      expect(fixture.events).toHaveLength(0);
      getConfig.mockReturnValue({
        ...defaults, osNotifications: false, terminalBell: true,
        notifications: { ...defaults.notifications!, alerts: {
          ...defaults.notifications!.alerts, 'file-operation': { desktop: false, sound: 'none' },
        } },
      });
      notify(fixture.managers, 'file-operation', 'build', 'Failed');
      expect(fixture.events).toHaveLength(0);
      expect(fixture.managers.notifications.all).toHaveLength(2);
      getConfig.mockReturnValue({ ...defaults, osNotifications: true, terminalBell: false });
      notify(fixture.managers, 'manual', 'build', 'Last');
      expect(fixture.events).toEqual([expect.objectContaining({ desktop: true, volume: 0 })]);
      getConfig.mockReturnValue({
        ...defaults, notifications: { ...defaults.notifications!, alerts: {
          ...defaults.notifications!.alerts, question: { desktop: true, sound: 'error' },
        } }, terminalBellVolumeError: 0.2,
      });
      notify(fixture.managers, 'question', 'build', 'Question');
      expect(fixture.events[1]).toMatchObject({ category: 'error', volume: 0.2 });
    } finally { fixture.dispose(); }
  });

  it('alerts for ambient events only when opted in and configured', () => {
    const fixture = setup();
    try {
      const defaults = config.getConfig();
      const getConfig = vi.spyOn(config, 'getConfig').mockReturnValue(defaults);
      notify(fixture.managers, 'state-change', 'build');
      expect(fixture.events).toHaveLength(0);
      getConfig.mockReturnValue({ ...defaults, notifications: {
        ...defaults.notifications!, events: { ...defaults.notifications!.events, stateChange: true },
        alerts: { ...defaults.notifications!.alerts, 'state-change': { desktop: true, sound: 'success' } },
      } });
      notify(fixture.managers, 'state-change', 'build');
      expect(fixture.events).toEqual([expect.objectContaining({ category: 'success', desktop: true })]);
      getConfig.mockReturnValue({ ...defaults, notifications: {
        ...defaults.notifications!, events: { ...defaults.notifications!.events, stateChange: true },
        alerts: { ...defaults.notifications!.alerts, 'state-change': { desktop: true, sound: 'none' } },
      } });
      notify(fixture.managers, 'state-change', 'build');
      expect(fixture.events[1]).toEqual(expect.objectContaining({ desktop: true, volume: 0 }));
      expect(fixture.events[1]).not.toHaveProperty('category');
      notify(fixture.managers, 'auto-approve', 'build', 'Approved', { detectedAt: new Date(2024, 0, 1) });
      expect(fixture.events).toHaveLength(2);
      expect(fixture.managers.notifications.all).toHaveLength(2);
    } finally { fixture.dispose(); }
  });

  it('provides defaults for every explicit and ambient event', () => {
    for (const event of Object.keys(EXPLICIT_EVENTS)) {
      expect(NOTIFICATION_ALERT_DEFAULTS[event as keyof typeof NOTIFICATION_ALERT_DEFAULTS].desktop).toBe(true);
      expect(NOTIFICATION_ALERT_DEFAULTS[event as keyof typeof NOTIFICATION_ALERT_DEFAULTS].sound).not.toBe('none');
    }
    for (const event of Object.keys(AMBIENT_EVENTS)) {
      expect(NOTIFICATION_ALERT_DEFAULTS[event as keyof typeof NOTIFICATION_ALERT_DEFAULTS])
        .toEqual({ desktop: false, sound: 'none' });
    }
    expect(NOTIFICATION_ALERT_DEFAULTS['plugin-failure'].sound).toBe('error');
    expect(NOTIFICATION_ALERT_DEFAULTS['harness-idle'].sound).toBe('warning');
    expect(NOTIFICATION_ALERT_DEFAULTS['system-schedule-fire'].sound).toBe('warning');
    expect(NOTIFICATION_ALERT_DEFAULTS.manual.sound).toBe('success');
  });
});
