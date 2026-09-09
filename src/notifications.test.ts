import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NotificationConfig } from './config.js';
import type { Managers } from './managers.js';
import {
  AMBIENT_EVENTS, EXPLICIT_EVENTS, shouldNotify, formatTimestamp, notificationText, notify,
  type AmbientNotificationEvent, type ExplicitNotificationEvent,
} from './notifications.js';
import { NOTIFICATIONS_LABEL } from './notifications-tab.js';
import { fakeNotificationsHost } from './notifications-tab-test-fixture.js';

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
    const tabs = [notif, janus];
    return {
      tab: { tabs, byLabel: (l: string) => tabs.find((t) => t.label === l), cur: () => notif, append },
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

  // Every event that passes `shouldNotify` is guaranteed a feed to land in, a plugin's note as much
  // as anything else — a note about the very tab the user is watching is the line that matters most.
  it('opens the feed for a plugin note when none is open', () => {
    const append = vi.fn();
    const janus = { label: 'janus', dotColor: '#abc', log: [] };
    const tabs = [janus];
    const managers = {
      tab: {
        tabs,
        byLabel: (l: string) => (l === 'janus' ? janus : undefined),
        cur: () => janus,
        append,
        ...fakeNotificationsHost(tabs),
      },
    } as unknown as Managers;

    notify(managers, 'plugin-note', 'janus', 'Dropped a.mp3 — it could not be played.');

    expect(tabs.some((t) => t.label === NOTIFICATIONS_LABEL)).toBe(true);
    expect(append).toHaveBeenCalledWith(
      NOTIFICATIONS_LABEL,
      expect.objectContaining({ output: 'Dropped a.mp3 — it could not be played.' }),
    );
  });

  // An event the config and focus rules reject costs nothing and opens nothing — the ambient
  // toggles stay a volume control rather than a way to fill the screen with sidebars.
  it('opens nothing for an ambient event whose toggle is off', () => {
    const append = vi.fn();
    const janus = { label: 'janus', dotColor: '#abc', log: [] };
    const build = { label: 'build', dotColor: '#def', log: [] };
    const tabs = [janus, build];
    const managers = {
      tab: {
        tabs,
        byLabel: (l: string) => tabs.find((t) => t.label === l),
        cur: () => janus,
        append,
        ...fakeNotificationsHost(tabs),
      },
    } as unknown as Managers;

    notify(managers, 'state-change', 'build');

    expect(tabs.some((t) => t.label === NOTIFICATIONS_LABEL)).toBe(false);
    expect(append).not.toHaveBeenCalled();
  });

  it('threads an owning-tab link onto a question notification', () => {
    const append = vi.fn();
    notify(makeManagers(append), 'question', 'janus', undefined, undefined, 'janus');
    const [, entry] = append.mock.calls[0];
    expect(entry.openTab).toBe('janus');
  });
});
