import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NotificationConfig } from './types.js';
import type { Managers } from './managers.js';
import { shouldNotify, formatTimestamp, notificationText, notify } from './notifications.js';
import { NOTIFICATIONS_LABEL } from './notifications-tab.js';

const allOn: NotificationConfig = {
  events: { stateChange: true, incomingMessage: true, scheduleFire: true, agentStart: true, rateLimited: true },
};
const allOff: NotificationConfig = {
  events: { stateChange: false, incomingMessage: false, scheduleFire: false, agentStart: false, rateLimited: false },
};

describe('shouldNotify — ambient events', () => {
  it('fires for a background tab when its event toggle is on', () => {
    expect(shouldNotify(allOn, 'state-change', 'build', 'janus')).toBe(true);
  });

  it('is suppressed for the currently active tab (focus suppression)', () => {
    expect(shouldNotify(allOn, 'state-change', 'janus', 'janus')).toBe(false);
  });

  it('is suppressed when the event toggle is off', () => {
    expect(shouldNotify(allOff, 'incoming-message', 'build', 'janus')).toBe(false);
  });

  it('is suppressed for the notifications tab\'s own label', () => {
    expect(shouldNotify(allOn, 'state-change', NOTIFICATIONS_LABEL, 'janus')).toBe(false);
  });

  it('is suppressed when the config is undefined', () => {
    expect(shouldNotify(undefined, 'agent-start', 'build', 'janus')).toBe(false);
  });

  it('fires for schedule-fire when its toggle is on', () => {
    expect(shouldNotify(allOn, 'schedule-fire', 'build', 'janus')).toBe(true);
  });

  it('is suppressed for schedule-fire when its toggle is off', () => {
    expect(shouldNotify(allOff, 'schedule-fire', 'build', 'janus')).toBe(false);
  });

  it('fires for agent-start when its toggle is on', () => {
    expect(shouldNotify(allOn, 'agent-start', 'build', 'janus')).toBe(true);
  });

  it('is suppressed for agent-start when its toggle is off', () => {
    expect(shouldNotify(allOff, 'agent-start', 'build', 'janus')).toBe(false);
  });

  it('fires for rate-limited when its toggle is on', () => {
    expect(shouldNotify(allOn, 'rate-limited', 'build', 'janus')).toBe(true);
  });

  it('is suppressed for rate-limited when its toggle is off', () => {
    expect(shouldNotify(allOff, 'rate-limited', 'build', 'janus')).toBe(false);
  });
});

describe('shouldNotify — manual event', () => {
  it('fires even when the issuing tab is active', () => {
    expect(shouldNotify(allOn, 'manual', 'janus', 'janus')).toBe(true);
  });

  it('fires regardless of the per-event toggles', () => {
    expect(shouldNotify(allOff, 'manual', 'build', 'janus')).toBe(true);
  });

  it('still never targets the notifications tab itself', () => {
    expect(shouldNotify(allOff, 'manual', NOTIFICATIONS_LABEL, 'janus')).toBe(false);
  });
});

describe('shouldNotify — auto-approve event', () => {
  it('fires even when the issuing tab is active', () => {
    expect(shouldNotify(allOn, 'auto-approve', 'claude', 'claude')).toBe(true);
  });

  it('fires regardless of the per-event toggles', () => {
    expect(shouldNotify(allOff, 'auto-approve', 'claude', 'janus')).toBe(true);
  });

  it('fires even when the config is undefined', () => {
    expect(shouldNotify(undefined, 'auto-approve', 'claude', 'janus')).toBe(true);
  });

  it('still never targets the notifications tab itself', () => {
    expect(shouldNotify(allOff, 'auto-approve', NOTIFICATIONS_LABEL, 'janus')).toBe(false);
  });

  it('returns the bare message (the label lives in the header)', () => {
    expect(notificationText('auto-approve', 'claude', 'Auto-approved a permission prompt')).toBe('Auto-approved a permission prompt');
  });
});

describe('formatTimestamp', () => {
  it('renders afternoon times in 12-hour form with pm', () => {
    expect(formatTimestamp(new Date(2026, 0, 1, 20, 32, 0))).toBe('8:32pm');
  });

  it('renders morning times with am and no leading zero on the hour', () => {
    expect(formatTimestamp(new Date(2026, 0, 1, 9, 5, 0))).toBe('9:05am');
  });

  it('renders the midnight hour as 12am', () => {
    expect(formatTimestamp(new Date(2026, 0, 1, 0, 15, 0))).toBe('12:15am');
  });

  it('renders noon as 12pm', () => {
    expect(formatTimestamp(new Date(2026, 0, 1, 12, 0, 0))).toBe('12:00pm');
  });

  it('renders one minute before midnight as 11:59pm', () => {
    expect(formatTimestamp(new Date(2026, 0, 1, 23, 59, 0))).toBe('11:59pm');
  });
});

describe('notificationText', () => {
  it('returns the bare message for a manual event (the label lives in the header)', () => {
    expect(notificationText('manual', 'janus', 'this is a notification')).toBe('this is a notification');
  });

  it('is unchanged for ambient events', () => {
    expect(notificationText('state-change', 'janus')).toBe("Agent 'janus' finished");
  });

  it('renders agent-start event text', () => {
    expect(notificationText('agent-start', 'build')).toBe("Agent 'build' started");
  });

  it('renders schedule-fire event text with the detail and tab', () => {
    expect(notificationText('schedule-fire', 'build', 'deploy')).toBe('Scheduled: deploy in build');
  });

  it('renders rate-limited event text', () => {
    expect(notificationText('rate-limited', 'build')).toBe("Agent 'build' is being rate limited");
  });
});

describe('notify — line composition', () => {
  function makeManagers(append: ReturnType<typeof vi.fn>): Managers {
    const notif = { label: NOTIFICATIONS_LABEL, view: 'notifications', log: [] };
    const janus = { label: 'janus', dotColor: '#abc', log: [] };
    return {
      tab: { tabs: [notif, janus], cur: () => notif, append },
    } as unknown as Managers;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 20, 32, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a manual notification as `<time> <label>: <message>` without duplicating the label', () => {
    const append = vi.fn();
    notify(makeManagers(append), 'manual', 'janus', 'this is a notification');
    expect(append).toHaveBeenCalledTimes(1);
    const [label, entry] = append.mock.calls[0];
    expect(label).toBe(NOTIFICATIONS_LABEL);
    expect(entry.from).toBe('8:32pm janus');
    expect(entry.output).toBe('this is a notification');
    expect(entry.fromColor).toBe('#abc');
  });
});
