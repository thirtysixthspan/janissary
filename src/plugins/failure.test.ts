import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { NOTIFICATIONS_LABEL } from '../notifications/tab.js';
import { fakeNotificationsHost } from '../notifications/tab-test-fixture.js';
import { NotificationQueue } from '../notifications/queue.js';
import {
  pluginFailureMessage,
  pluginFailureReason,
  reportPluginFailure,
} from './failure.js';

function makeManagers(options: { origin?: boolean; notifications?: boolean } = {}) {
  const origin = { label: 'janus', dotColor: '#abc', log: [] };
  const notifications = { label: NOTIFICATIONS_LABEL, view: 'notifications', log: [] };
  const tabs = [
    ...(options.origin === false ? [] : [origin]),
    ...(options.notifications ? [notifications] : []),
  ];
  const append = vi.fn();
  const host = fakeNotificationsHost(tabs);
  const openNotificationsTab = vi.fn(host.openNotificationsTab);
  const managers = {
    tab: {
      tabs,
      byLabel: (label: string) => tabs.find((t: { label: string }) => t.label === label),
      append,
      cur: () => origin,
      ...host,
      openNotificationsTab,
    },
    notifications: new NotificationQueue(),
  } as unknown as Managers;
  return { append, managers, openNotificationsTab, tabs };
}

describe('plugin failure formatting', () => {
  it.each([
    [new Error('decoder exploded.'), 'decoder exploded'],
    ['chunk rejected?!', 'chunk rejected'],
    [42, '42'],
    [new Error('first line\n    at private-stack.ts:10'), 'first line'],
    ['...!?:', 'Unknown failure'],
  ])('reduces thrown value %# to one actionable line', (error, expected) => {
    expect(pluginFailureReason(error)).toBe(expected);
  });

  it('wraps the reason with exact wording and one terminal period', () => {
    expect(pluginFailureMessage('video', new Error('decode failed!!')))
      .toBe('Tab plugin "video" disabled: decode failed.');
  });
});

describe('reportPluginFailure', () => {
  const origin = { label: 'janus', command: 'open clip.mp4' };

  it('delivers the same message to the origin and an already-open feed', () => {
    const fixture = makeManagers({ notifications: true });
    const message = reportPluginFailure(fixture.managers, 'video', 'chunk rejected', origin);
    expect(message).toBe('Tab plugin "video" disabled: chunk rejected.');
    expect(fixture.append).toHaveBeenCalledWith('janus', {
      input: 'open clip.mp4', output: message,
    });
    expect(fixture.append).toHaveBeenCalledWith(
      NOTIFICATIONS_LABEL,
      expect.objectContaining({ input: '', output: message }),
    );
  });

  // A closed feed is left closed — the failure toasts instead — and the queue holds the line for
  // whenever the feed is opened.
  it('leaves a closed notifications feed closed and holds the failure in the queue', () => {
    const fixture = makeManagers();
    const before = fixture.tabs.length;
    reportPluginFailure(fixture.managers, 'video', 'failed', origin);
    expect(fixture.openNotificationsTab).not.toHaveBeenCalled();
    expect(fixture.tabs).toHaveLength(before);
    expect(fixture.append).not.toHaveBeenCalledWith(NOTIFICATIONS_LABEL, expect.anything());
    expect(fixture.managers.notifications.all.map((n) => n.message))
      .toContain('Tab plugin "video" disabled: failed.');
  });

  it('does not recreate a closed originating tab', () => {
    const fixture = makeManagers({ origin: false, notifications: true });
    reportPluginFailure(fixture.managers, 'video', 'failed', origin);
    expect(fixture.append).not.toHaveBeenCalledWith('janus', expect.anything());
    expect(fixture.openNotificationsTab).not.toHaveBeenCalled();
    expect(fixture.tabs.some((tab) => tab.label === 'janus')).toBe(false);
  });
});
