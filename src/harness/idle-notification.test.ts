import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  armHarnessIdleEscalation, cancelHarnessIdleEscalation, disposeHarnessIdleEscalations,
  HARNESS_IDLE_ESCALATION_MS,
} from './idle-notification.js';
import { NotificationQueue } from '../notifications/queue.js';
import { fakeNotificationsHost } from '../notifications/tab-test-fixture.js';
import { clearUnreadTab, markUnreadTab } from '../tab/transcript/events.js';
import { makeTab } from '../tab/index.js';
import { UNREAD_DWELL_MS } from '../tab/dwell.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

function setup(harnessLabel = 'build') {
  const janus = makeTab('janus', '#abc');
  const harness = makeTab(harnessLabel, '#def');
  const tabs: Tab[] = [janus, harness];
  const append = vi.fn();
  const toasts: Array<{ from: string; message: string }> = [];
  const subscriptions = [
    messageBus.on('notifications', 'toast', (event) => {
      if (event.type === 'toast') toasts.push({ from: event.from, message: event.message });
    }),
  ];
  const managers = {
    tab: {
      // The host fixture supplies the tab-manager surface the notification path reaches when it
      // opens the feed, and it comes first so this fixture's own badge methods are the ones that
      // survive: its `markUnread` is inert, and an escalation test needs a real badge.
      ...fakeNotificationsHost(tabs),
      tabs,
      activeTab: 0,
      byLabel: (l: string) => tabs.find((t) => t.label === l),
      cur: () => tabs[0],
      append,
      markUnread: (l: string) => markUnreadTab(tabs, l, tabs[0].label),
      clearUnread: (l: string) => { clearUnreadTab(tabs, l); },
    },
    notifications: new NotificationQueue(),
  } as unknown as Managers;
  const messages = () => managers.notifications.all.map((n) => n.message);
  const dispose = () => { for (const s of subscriptions) s.unsubscribe(); };
  current = managers;
  return { append, dispose, harness, janus, managers, messages, tabs, toasts };
}

let current: Managers | undefined;

// Dispose before clearing the bus, the order `Controller.shutdown` uses: the escalation releases its
// own badge-clear subscription, and the next case's first arm attaches a fresh one.
afterEach(() => {
  if (current) disposeHarnessIdleEscalations(current);
  current = undefined;
  messageBus.clear();
  vi.useRealTimers();
});

describe('harness idle escalation', () => {
  it('notifies once, with the tab named and linked, when the grace period runs out', () => {
    vi.useFakeTimers();
    const fixture = setup();
    try {
      fixture.managers.tab.markUnread('build');
      armHarnessIdleEscalation(fixture.managers, 'build');

      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS - 1);
      expect(fixture.messages()).toEqual([]);

      vi.advanceTimersByTime(1);
      expect(fixture.messages()).toEqual(["Agent 'build' is waiting"]);
      expect(fixture.toasts).toEqual([{ from: 'build', message: "Agent 'build' is waiting" }]);
      // The line links back to the tab, which is the difference between knowing and going.
      expect(fixture.managers.notifications.all[0].openTab).toBe('build');
    } finally { fixture.dispose(); }
  });

  // A harness running short turns should say something once it settles, not once per turn: a new
  // commit replaces the pending escalation, so the interval runs from the most recent idle.
  it('replaces a pending escalation rather than queueing a second one', () => {
    vi.useFakeTimers();
    const fixture = setup();
    try {
      fixture.managers.tab.markUnread('build');
      armHarnessIdleEscalation(fixture.managers, 'build');
      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS - 1);

      clearUnreadTab(fixture.tabs, 'build');
      fixture.managers.tab.markUnread('build');
      armHarnessIdleEscalation(fixture.managers, 'build');

      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS - 1);
      expect(fixture.messages()).toEqual([]);

      vi.advanceTimersByTime(1);
      expect(fixture.messages()).toEqual(["Agent 'build' is waiting"]);
    } finally { fixture.dispose(); }
  });

  it('cancels when the badge comes off, however it came off', () => {
    vi.useFakeTimers();
    const fixture = setup();
    try {
      fixture.managers.tab.markUnread('build');
      armHarnessIdleEscalation(fixture.managers, 'build');
      // What a completed unread dwell, a focus the user stayed on, or an auto-approve landing late
      // all end up doing: taking the badge off, which is the escalation's whole lifetime.
      clearUnreadTab(fixture.tabs, 'build');

      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS * 2);
      expect(fixture.messages()).toEqual([]);
      expect(fixture.toasts).toEqual([]);
    } finally { fixture.dispose(); }
  });

  // The case above passes either way: with the badge down, the fire-time check discards the
  // escalation whether or not anything cancelled it. Re-raising the badge behind that check's back
  // leaves the subscription as the only thing that can stop it, so this fails if the
  // `tabs: unread-cleared` listener is gone.
  it('cancels on the badge-clear signal even when the badge comes back', () => {
    vi.useFakeTimers();
    const fixture = setup();
    try {
      fixture.managers.tab.markUnread('build');
      armHarnessIdleEscalation(fixture.managers, 'build');
      clearUnreadTab(fixture.tabs, 'build');
      // Deliberate, not a setup slip: the escalation must not be rescued by the badge being back.
      fixture.harness.hasUnread = true;

      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS * 2);
      expect(fixture.messages()).toEqual([]);
      expect(fixture.toasts).toEqual([]);
    } finally { fixture.dispose(); }
  });

  // A shutdown disposes and then clears the bus. An arm after that — the next controller in the same
  // process — must still be cancelled by a badge clear, so the subscription has to come back with it.
  it('cancels on the badge-clear signal after a dispose and a bus clear', () => {
    vi.useFakeTimers();
    const fixture = setup();
    try {
      armHarnessIdleEscalation(fixture.managers, 'build');
      disposeHarnessIdleEscalations(fixture.managers);
      messageBus.clear();

      fixture.managers.tab.markUnread('build');
      armHarnessIdleEscalation(fixture.managers, 'build');
      clearUnreadTab(fixture.tabs, 'build');
      fixture.harness.hasUnread = true;

      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS * 2);
      expect(fixture.messages()).toEqual([]);
    } finally { fixture.dispose(); }
  });

  it('cancels on an explicit cancel, as a tab close does', () => {
    vi.useFakeTimers();
    const fixture = setup();
    try {
      armHarnessIdleEscalation(fixture.managers, 'build');
      cancelHarnessIdleEscalation(fixture.managers, 'build');

      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS * 2);
      expect(fixture.messages()).toEqual([]);
    } finally { fixture.dispose(); }
  });

  it('says nothing for a tab that has gone', () => {
    vi.useFakeTimers();
    const fixture = setup();
    try {
      fixture.managers.tab.markUnread('build');
      armHarnessIdleEscalation(fixture.managers, 'build');
      fixture.tabs.length = 1;

      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS);
      expect(fixture.messages()).toEqual([]);
    } finally { fixture.dispose(); }
  });

  // Docking a tab into a sidebar deliberately leaves its badge in place, so the badge alone would
  // escalate a tab that is permanently visible chrome. Re-asking the badge's own eligibility rule is
  // what keeps that from being announced.
  it('says nothing for a tab docked into a sidebar while it was waiting', () => {
    vi.useFakeTimers();
    const fixture = setup();
    try {
      fixture.managers.tab.markUnread('build');
      armHarnessIdleEscalation(fixture.managers, 'build');
      fixture.harness.dock = 'right';

      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS);
      expect(fixture.messages()).toEqual([]);
    } finally { fixture.dispose(); }
  });

  // A notification never lands on a tab the user is looking at, but a glance is not a read: a user
  // who is on the tab at 30s and moves on before the dwell finishes leaves the badge up, so the
  // escalation waits for them to go rather than dying with the badge still set.
  it('waits out a glance that straddles the grace period, then notifies', () => {
    vi.useFakeTimers();
    const fixture = setup();
    try {
      fixture.managers.tab.markUnread('build');
      armHarnessIdleEscalation(fixture.managers, 'build');
      fixture.tabs.reverse();

      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS);
      expect(fixture.messages()).toEqual([]);

      fixture.tabs.reverse();
      vi.advanceTimersByTime(UNREAD_DWELL_MS);
      expect(fixture.messages()).toEqual(["Agent 'build' is waiting"]);
    } finally { fixture.dispose(); }
  });

  // The other half: a user who stays on the tab completes its dwell, and that badge clear cancels the
  // re-check, so nothing is ever said.
  it('says nothing when the user stays on the tab past the grace period', () => {
    vi.useFakeTimers();
    const fixture = setup();
    try {
      fixture.managers.tab.markUnread('build');
      armHarnessIdleEscalation(fixture.managers, 'build');
      fixture.tabs.reverse();

      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS + 1000);
      clearUnreadTab(fixture.tabs, 'build');
      fixture.tabs.reverse();
      fixture.harness.hasUnread = true;

      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS * 2);
      expect(fixture.messages()).toEqual([]);
    } finally { fixture.dispose(); }
  });

  it('says nothing for a tab showing in the other pane when the grace period runs out', () => {
    vi.useFakeTimers();
    const fixture = setup();
    try {
      fixture.managers.tab.markUnread('build');
      armHarnessIdleEscalation(fixture.managers, 'build');
      (fixture.managers.tab as unknown as { secondaryTabLabel?: string }).secondaryTabLabel = 'build';

      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS);
      expect(fixture.messages()).toEqual([]);
    } finally { fixture.dispose(); }
  });

  it('says nothing when the badge was dropped without the escalation being cancelled', () => {
    vi.useFakeTimers();
    const fixture = setup();
    try {
      fixture.managers.tab.markUnread('build');
      armHarnessIdleEscalation(fixture.managers, 'build');
      // Mutated behind the primitive's back, the way a stale view of the tab might see it: the
      // fire-time badge check is the backstop for a close, which clears a different tab's badge.
      fixture.harness.hasUnread = false;

      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS);
      expect(fixture.messages()).toEqual([]);
    } finally { fixture.dispose(); }
  });

  it('drops every pending escalation on dispose', () => {
    vi.useFakeTimers();
    const fixture = setup();
    try {
      fixture.managers.tab.markUnread('build');
      armHarnessIdleEscalation(fixture.managers, 'build');
      disposeHarnessIdleEscalations(fixture.managers);

      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS * 2);
      expect(fixture.messages()).toEqual([]);
    } finally { fixture.dispose(); }
  });

  // A close or reorder replaces every tab with a shallow copy. The pending handle sits on the runtime
  // record those copies share, so a badge clear reaching the copy still finds and cancels it.
  it('cancels through the live tab after the tabs are replaced by copies', () => {
    vi.useFakeTimers();
    const fixture = setup();
    try {
      fixture.managers.tab.markUnread('build');
      armHarnessIdleEscalation(fixture.managers, 'build');
      fixture.tabs.splice(0, fixture.tabs.length, ...fixture.tabs.map((t) => ({ ...t })));

      clearUnreadTab(fixture.tabs, 'build');
      fixture.tabs[1].hasUnread = true;

      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS * 2);
      expect(fixture.messages()).toEqual([]);
    } finally { fixture.dispose(); }
  });

  it('reports under the tab\'s own name rather than its label', () => {
    vi.useFakeTimers();
    const fixture = setup('sql');
    try {
      fixture.tabs[1].title = 'shop';
      fixture.managers.tab.markUnread('sql');
      armHarnessIdleEscalation(fixture.managers, 'sql');

      vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS);
      expect(fixture.messages()).toEqual(["Agent 'shop' is waiting"]);
    } finally { fixture.dispose(); }
  });
});
