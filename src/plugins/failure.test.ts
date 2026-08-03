import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { NOTIFICATIONS_LABEL } from '../notifications-tab.js';
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
  const openNotificationsTab = vi.fn();
  const managers = {
    tab: {
      tabs,
      append,
      cur: () => origin,
      openNotificationsTab,
    },
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

  it('does not create or append to a closed notifications feed', () => {
    const fixture = makeManagers();
    const before = fixture.tabs.length;
    reportPluginFailure(fixture.managers, 'video', 'failed', origin);
    expect(fixture.append).toHaveBeenCalledTimes(1);
    expect(fixture.openNotificationsTab).not.toHaveBeenCalled();
    expect(fixture.tabs).toHaveLength(before);
  });

  it('does not recreate a closed originating tab', () => {
    const fixture = makeManagers({ origin: false, notifications: true });
    reportPluginFailure(fixture.managers, 'video', 'failed', origin);
    expect(fixture.append).not.toHaveBeenCalledWith('janus', expect.anything());
    expect(fixture.openNotificationsTab).not.toHaveBeenCalled();
    expect(fixture.tabs.some((tab) => tab.label === 'janus')).toBe(false);
  });
});
