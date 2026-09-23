import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NotificationConfig } from './config.js';
import type { Managers } from './managers.js';
import {
  AMBIENT_EVENTS, EXPLICIT_EVENTS, shouldNotify, notificationText, notify,
  type AmbientNotificationEvent, type ExplicitNotificationEvent,
} from './index.js';
import { NOTIFICATIONS_LABEL } from './tab.js';
import { fakeNotificationsHost } from './tab-test-fixture.js';
import { NotificationQueue } from './queue.js';
import { messageBus } from '../bus.js';

const allOn: NotificationConfig = {
  events: { stateChange: true, incomingMessage: true, scheduleFire: true, agentStart: true, rateLimited: true },
};
const allOff: NotificationConfig = {
  events: { stateChange: false, incomingMessage: false, scheduleFire: false, agentStart: false, rateLimited: false },
};

// One case per member of `NotificationEventType`, driven off the tables that classify them — so a
// seventeenth event is covered the moment it is added, rather than needing a case written for it.
// Before the tables existed, both switches ended in a `default` arm that answered `false`, so a new
// event compiled, shipped, and never reached the feed.
describe('shouldNotify covers every notification event', () => {
  const ambientEntries = Object.entries(AMBIENT_EVENTS) as Array<
    [AmbientNotificationEvent, keyof NotificationConfig['events']]
  >;
  const explicitEvents = Object.keys(EXPLICIT_EVENTS) as ExplicitNotificationEvent[];

  it.each(explicitEvents)('fires for the explicit event %s whatever the config and focus say', (event) => {
    expect(shouldNotify(allOff, event, 'janus', 'janus')).toBe(true);
    expect(shouldNotify(undefined, event, 'build', 'janus')).toBe(true);
  });

  it.each(ambientEntries)('gates the ambient event %s on the %s toggle and on focus', (event, toggle) => {
    expect(allOn.events[toggle]).toBe(true);
    expect(shouldNotify(allOn, event, 'build', 'janus')).toBe(true);
    expect(shouldNotify(allOff, event, 'build', 'janus')).toBe(false);
    expect(shouldNotify(allOn, event, 'janus', 'janus')).toBe(false);
  });

  it.each([...explicitEvents, ...ambientEntries.map(([event]) => event)])(
    'is suppressed for %s on the notifications tab itself',
    (event) => { expect(shouldNotify(allOn, event, NOTIFICATIONS_LABEL, 'janus')).toBe(false); },
  );

  // Ties the classification tables to the already-exhaustive dispatcher in the same file: an event
  // in neither table cannot compile, and one in a table must have text to render.
  it.each([...explicitEvents, ...ambientEntries.map(([event]) => event)])(
    'renders text for %s',
    (event) => { expect(typeof notificationText(event, 'build', 'detail')).toBe('string'); },
  );
});

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

describe('shouldNotify — transcript-unavailable event', () => {
  it('fires regardless of the per-event toggles, like the other explicit events', () => {
    expect(shouldNotify(allOff, 'transcript-unavailable', 'claude', 'janus')).toBe(true);
    expect(shouldNotify(undefined, 'transcript-unavailable', 'claude', 'janus')).toBe(true);
  });

  it('fires even when the harness tab is the active one', () => {
    expect(shouldNotify(allOn, 'transcript-unavailable', 'claude', 'claude')).toBe(true);
  });

  it('renders the fallback body, with the label supplied by the line header', () => {
    expect(notificationText('transcript-unavailable', 'claude')).toBe('no harness transcript found');
  });
});

describe('shouldNotify — ssh-recording-failed event', () => {
  it('fires regardless of the per-event toggles, like the other explicit events', () => {
    expect(shouldNotify(allOff, 'ssh-recording-failed', 'devbox', 'janus')).toBe(true);
    expect(shouldNotify(undefined, 'ssh-recording-failed', 'devbox', 'janus')).toBe(true);
  });

  it('fires even when the ssh tab is the active one', () => {
    expect(shouldNotify(allOn, 'ssh-recording-failed', 'devbox', 'devbox')).toBe(true);
  });

  it('renders the fixed body, with the label supplied by the line header', () => {
    expect(notificationText('ssh-recording-failed', 'devbox')).toBe('ssh recording failed');
  });
});

describe('shouldNotify — harness-recording-failed event', () => {
  it('fires regardless of the per-event toggles, like the other explicit events', () => {
    expect(shouldNotify(allOff, 'harness-recording-failed', 'claude', 'janus')).toBe(true);
    expect(shouldNotify(undefined, 'harness-recording-failed', 'claude', 'janus')).toBe(true);
  });

  it('fires even when the harness tab is the active one', () => {
    expect(shouldNotify(allOn, 'harness-recording-failed', 'claude', 'claude')).toBe(true);
  });

  it('renders the fixed body, with the label supplied by the line header', () => {
    expect(notificationText('harness-recording-failed', 'claude')).toBe('harness recording failed');
  });
});

describe('shouldNotify — e2e-browser-gone event', () => {
  it('fires regardless of the per-event toggles, like the other explicit events', () => {
    expect(shouldNotify(allOff, 'e2e-browser-gone', 'claude', 'janus')).toBe(true);
    expect(shouldNotify(undefined, 'e2e-browser-gone', 'claude', 'janus')).toBe(true);
  });

  // The tab whose browser just died is very often the tab the user is watching, which is exactly
  // the case focus suppression would have discarded.
  it('bypasses focus suppression when the -b tab is the active one', () => {
    expect(shouldNotify(allOn, 'e2e-browser-gone', 'claude', 'claude')).toBe(true);
  });

  it('renders the reported detail as the body', () => {
    expect(notificationText('e2e-browser-gone', 'claude', 'e2e browser exited')).toBe('e2e browser exited');
  });

  it('falls back to a fixed body when no detail is given', () => {
    expect(notificationText('e2e-browser-gone', 'claude')).toBe('e2e browser stopped');
  });
});

describe('shouldNotify — file-operation event', () => {
  it('fires regardless of notification config', () => {
    expect(shouldNotify(undefined, 'file-operation', 'build', 'janus')).toBe(true);
    expect(shouldNotify(allOff, 'file-operation', 'build', 'janus')).toBe(true);
  });

  it('fires even when the issuing tab is active', () => {
    expect(shouldNotify(allOn, 'file-operation', 'janus', 'janus')).toBe(true);
  });

  it('returns the bare message (the label lives in the header)', () => {
    expect(notificationText('file-operation', 'janus', 'Could not delete 1 of 2 items: a.md')).toBe('Could not delete 1 of 2 items: a.md');
  });
});

describe('shouldNotify — plugin-note event', () => {
  // The case a dropped track hits most often: the audio tab reporting while the user is watching it.
  // An ambient event would be discarded here, which is exactly why this one is explicit.
  it('fires while the reporting plugin\'s own tab is the active one', () => {
    expect(shouldNotify(allOn, 'plugin-note', 'audio', 'audio')).toBe(true);
  });

  it('fires regardless of the per-event toggles and with no config at all', () => {
    expect(shouldNotify(allOff, 'plugin-note', 'audio', 'janus')).toBe(true);
    expect(shouldNotify(undefined, 'plugin-note', 'audio', 'janus')).toBe(true);
  });

  it('still never targets the notifications tab itself', () => {
    expect(shouldNotify(allOn, 'plugin-note', NOTIFICATIONS_LABEL, 'janus')).toBe(false);
  });

  it('returns the plugin\'s bare line (the label lives in the header)', () => {
    expect(notificationText('plugin-note', 'audio', 'Dropped a.mp3 — it could not be played.'))
      .toBe('Dropped a.mp3 — it could not be played.');
  });
});

describe('shouldNotify — question event', () => {
  it('fires regardless of notification config', () => {
    expect(shouldNotify(undefined, 'question', 'build', 'janus')).toBe(true);
  });

  it('formats the waiting-agent message', () => {
    expect(notificationText('question', 'build')).toBe('Question from build');
  });
});

describe('notify — line composition', () => {
  function makeManagers(append: ReturnType<typeof vi.fn>): Managers {
    const notif = { label: NOTIFICATIONS_LABEL, view: 'notifications', log: [] };
    const janus = { label: 'janus', dotColor: '#abc', log: [] };
    const tabs = [notif, janus];
    return {
      tab: { tabs, byLabel: (l: string) => tabs.find((t) => t.label === l), cur: () => notif, append },
      notifications: new NotificationQueue(),
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

  // Decision 17 of the auto-accept-while-detached plan: a remote harness's queued auto-approve
  // report is replayed on reattach and must read as having happened when it actually did, not at the
  // moment of reattachment.
  it('stamps the header with a given detectedAt time rather than now', () => {
    const append = vi.fn();
    notify(
      makeManagers(append), 'auto-approve', 'janus', 'Auto-approved a permission prompt',
      undefined, undefined, new Date(2026, 0, 1, 9, 5, 0),
    );
    const [, entry] = append.mock.calls[0];
    expect(entry.from).toBe('9:05am janus');
  });

  it('defaults detectedAt to now when not given', () => {
    const append = vi.fn();
    notify(makeManagers(append), 'auto-approve', 'janus', 'Auto-approved a permission prompt');
    const [, entry] = append.mock.calls[0];
    expect(entry.from).toBe('8:32pm janus');
  });

  it('dates the header for a detectedAt several days back, rather than reading as today', () => {
    const append = vi.fn();
    notify(
      makeManagers(append), 'auto-approve', 'janus', 'Auto-approved a permission prompt',
      undefined, undefined, new Date(2025, 11, 28, 9, 5, 0),
    );
    const [, entry] = append.mock.calls[0];
    expect(entry.from).toBe('Dec 28 9:05am janus');
  });

  it('dates the header for a detectedAt from 11pm the previous calendar day, even though it is only hours old', () => {
    const append = vi.fn();
    notify(
      makeManagers(append), 'auto-approve', 'janus', 'Auto-approved a permission prompt',
      undefined, undefined, new Date(2025, 11, 31, 23, 0, 0),
    );
    const [, entry] = append.mock.calls[0];
    expect(entry.from).toBe('Dec 31 11:00pm janus');
  });

  it('threads an openFile path onto the appended entry when given', () => {
    const append = vi.fn();
    notify(makeManagers(append), 'auto-approve', 'janus', 'Auto-approved a permission prompt', '/captures/janus-now.txt');
    const [, entry] = append.mock.calls[0];
    expect(entry.openFile).toBe('/captures/janus-now.txt');
  });

  it('omits openFile from the appended entry when not given', () => {
    const append = vi.fn();
    notify(makeManagers(append), 'auto-approve', 'janus', 'Auto-approved a permission prompt');
    const [, entry] = append.mock.calls[0];
    expect(entry.openFile).toBeUndefined();
  });

  it('threads an owning-tab link onto a question notification', () => {
    const append = vi.fn();
    notify(makeManagers(append), 'question', 'janus', undefined, undefined, 'janus');
    const [, entry] = append.mock.calls[0];
    expect(entry.openTab).toBe('janus');
  });
});

// Holding a notification and rendering one are separate: everything `shouldNotify` accepts reaches
// the queue, and only then is a surface chosen.
describe('notify — surface routing', () => {
  function setup() {
    const append = vi.fn();
    const janus = { label: 'janus', dotColor: '#abc', log: [] };
    const tabs: Array<{ label: string; dotColor?: string; log?: unknown[]; view?: string; dock?: 'left' | 'right' }> = [janus];
    const toasts: Array<{ from: string; message: string; color?: string }> = [];
    const clears: number[] = [];
    const reveals: Array<'left' | 'right'> = [];
    const subscriptions = [
      messageBus.on('notifications', 'toast', (event) => {
        if (event.type === 'toast') toasts.push({ from: event.from, message: event.message, color: event.color });
      }),
      messageBus.on('notifications', 'clear', () => { clears.push(1); }),
      messageBus.on('notifications', 'reveal', (event) => { reveals.push(event.dock); }),
    ];
    const managers = {
      tab: {
        tabs,
        byLabel: (l: string) => tabs.find((t) => t.label === l),
        cur: () => tabs[0],
        append,
        ...fakeNotificationsHost(tabs),
      },
      notifications: new NotificationQueue(),
    } as unknown as Managers;
    const dispose = () => { for (const s of subscriptions) s.unsubscribe(); };
    return { append, clears, dispose, managers, tabs, toasts, reveals };
  }

  it('records an accepted event in the queue whatever surface shows it', () => {
    const fixture = setup();
    try {
      notify(fixture.managers, 'plugin-note', 'janus', 'Dropped a.mp3.');
      expect(fixture.managers.notifications.all.map((n) => n.message)).toEqual(['Dropped a.mp3.']);
    } finally { fixture.dispose(); }
  });

  // An event the config and focus rules reject costs nothing: no queue entry, no toast, no feed.
  it('touches nothing for an ambient event whose toggle is off', () => {
    const fixture = setup();
    try {
      fixture.tabs.push({ label: 'build', dotColor: '#def', log: [] });
      notify(fixture.managers, 'state-change', 'build');
      expect(fixture.managers.notifications.all).toHaveLength(0);
      expect(fixture.toasts).toHaveLength(0);
      expect(fixture.tabs.some((t) => t.label === NOTIFICATIONS_LABEL)).toBe(false);
      expect(fixture.append).not.toHaveBeenCalled();
    } finally { fixture.dispose(); }
  });

  it('toasts, and opens no feed, when none is on screen', () => {
    const fixture = setup();
    try {
      notify(fixture.managers, 'plugin-note', 'janus', 'Dropped a.mp3.');
      expect(fixture.toasts).toEqual([{ from: 'janus', message: 'Dropped a.mp3.', color: '#abc' }]);
      expect(fixture.tabs.some((t) => t.label === NOTIFICATIONS_LABEL)).toBe(false);
    } finally { fixture.dispose(); }
  });

  it('routes toasts when a docked feed may be hidden from this client', () => {
    const fixture = setup();
    try {
      fixture.tabs.push({ label: NOTIFICATIONS_LABEL, view: 'notifications', log: [], dock: 'right' });
      notify(fixture.managers, 'plugin-note', 'janus', 'Dropped a.mp3.');
      expect(fixture.toasts).toHaveLength(1);
      expect(fixture.append).toHaveBeenCalledWith(
        NOTIFICATIONS_LABEL,
        expect.objectContaining({ output: 'Dropped a.mp3.' }),
      );
    } finally { fixture.dispose(); }
  });

  // A toast carries no time, so it cannot honestly represent something detected hours ago.
  it('raises no toast for a replayed notification', () => {
    const fixture = setup();
    try {
      notify(
        fixture.managers, 'auto-approve', 'janus', 'Auto-approved a permission prompt',
        undefined, undefined, new Date(2025, 11, 28, 9, 5, 0),
      );
      expect(fixture.toasts).toHaveLength(0);
      expect(fixture.managers.notifications.all).toHaveLength(1);
    } finally { fixture.dispose(); }
  });

  it('escalates to the feed on the third notification inside the burst window', () => {
    const fixture = setup();
    try {
      for (const message of ['one', 'two', 'three']) {
        notify(fixture.managers, 'plugin-note', 'janus', message);
      }
      expect(fixture.tabs.some((t) => t.view === 'notifications')).toBe(true);
      expect(fixture.toasts.map((t) => t.message)).toEqual(['one', 'two']);
      expect(fixture.clears).toHaveLength(1);
      expect(fixture.reveals).toEqual(['right']);
    } finally { fixture.dispose(); }
  });

  // Replays count toward the burst by arrival, so a reattach delivering several docks the feed
  // open without ever having toasted: silence in the corner, history in the feed.
  it('escalates for replayed notifications that never toasted', () => {
    const fixture = setup();
    try {
      for (const message of ['one', 'two', 'three']) {
        notify(
          fixture.managers, 'auto-approve', 'janus', message,
          undefined, undefined, new Date(2025, 11, 28, 9, 5, 0),
        );
      }
      expect(fixture.tabs.some((t) => t.view === 'notifications')).toBe(true);
      expect(fixture.toasts).toHaveLength(0);
    } finally { fixture.dispose(); }
  });
});
it.each(['schedule-late', 'remote-session-terminated'] as const)('shows the composed %s detail without configuration', (event) => {
  expect(shouldNotify(undefined, event, 'active', 'active')).toBe(true);
  expect(notificationText(event, 'active', 'full detail')).toBe('full detail');
  expect(notificationText(event, 'active')).toBe('');
});
