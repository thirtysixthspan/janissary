import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { NativeNotificationEvent } from '../protocol/events.js';
import * as config from '../config.js';
import { messageBus } from '../bus.js';
import { notify, EXPLICIT_EVENTS, AMBIENT_EVENTS } from './index.js';
import { NotificationQueue } from './queue.js';
import { fakeNotificationsHost } from './tab-test-fixture.js';
import { initNotificationRecord } from './record.js';
import { soundCategory } from './sound-category.js';

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

  it('respects both master switches and category volume and mute', () => {
    const fixture = setup();
    try {
      const defaults = config.getConfig();
      const getConfig = vi.spyOn(config, 'getConfig');
      getConfig.mockReturnValue({ ...defaults, osNotifications: false, terminalBell: false });
      notify(fixture.managers, 'manual', 'build', 'First');
      expect(fixture.events).toHaveLength(0);
      getConfig.mockReturnValue({
        ...defaults, osNotifications: false, terminalBell: true, terminalBellMuteError: true,
      });
      notify(fixture.managers, 'file-operation', 'build', 'Failed');
      expect(fixture.events).toHaveLength(0);
      getConfig.mockReturnValue({ ...defaults, osNotifications: true, terminalBell: false });
      notify(fixture.managers, 'manual', 'build', 'Last');
      expect(fixture.events).toEqual([expect.objectContaining({ desktop: true, volume: 0 })]);
    } finally { fixture.dispose(); }
  });

  it('does not alert for historical replays or ambient events', () => {
    const fixture = setup();
    try {
      notify(fixture.managers, 'auto-approve', 'build', 'Approved', { detectedAt: new Date(2024, 0, 1) });
      notify(fixture.managers, 'state-change', 'build');
      expect(fixture.events).toHaveLength(0);
      expect(fixture.managers.notifications.all).toHaveLength(1);
    } finally { fixture.dispose(); }
  });

  it('classifies every explicit event and no ambient event', () => {
    for (const event of Object.keys(EXPLICIT_EVENTS)) expect(soundCategory(event)).toBeDefined();
    for (const event of Object.keys(AMBIENT_EVENTS)) expect(soundCategory(event)).toBeUndefined();
    expect(soundCategory('plugin-failure')).toBe('error');
    expect(soundCategory('harness-idle')).toBe('warning');
    expect(soundCategory('manual')).toBe('success');
  });
});
