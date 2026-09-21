import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { messageBus } from '../bus.js';
import { notify } from '../notifications.js';
import type { Managers } from '../managers.js';
import type { RemoteEntry } from '../remote/attach.js';
import { SessionsManager } from './manager.js';
import { startSessionAttach, type AttachOutcome } from './attach.js';
import { terminateParkedSession, type TerminateOutcome } from './terminate-session.js';
import { initRemoteSessionStore, loadRemoteSessions, saveRemoteSessions, type RemoteSessionRecord } from './store.js';

// The attach and end flows open real ssh connections, so they are faked here: what this suite is
// about is the manager's own bookkeeping — which record survives which outcome, what the row set
// says afterwards, and whether the change signal fired.
vi.mock('./attach.js', () => ({ startSessionAttach: vi.fn() }));
// `isTerminateSessionLabel` is the real one: it is the pure half of that module, and the manager's ability
// to tell an end channel from a live session depends on it agreeing with the label the module mints.
vi.mock(import('./terminate-session.js'), async (importOriginal) => ({
  ...await importOriginal(),
  terminateParkedSession: vi.fn(),
}));
vi.mock('../notifications.js', () => ({ notify: vi.fn() }));

const SESSION = '11111111-2222-3333-4444-555555555555';

function record(overrides: Partial<RemoteSessionRecord> = {}): RemoteSessionRecord {
  return {
    session: SESSION,
    address: 'devbox',
    destination: 'devbox',
    host: 'devbox',
    workspaceLabel: 'claude',
    workspaceDir: '/srv/proj/.janissary/workspace/claude',
    launchLabel: 'claude',
    launchKind: 'harness',
    processes: [{ id: 'rpty1', label: 'claude', kind: 'harness', harness: 'claude' }],
    activity: Date.now(),
    ...overrides,
  };
}

function entry(overrides: Partial<RemoteEntry> = {}): RemoteEntry {
  return {
    channel: {
      sessionId: SESSION,
      spawnedProcesses: () => [{ id: 'rpty1', program: 'claude', mode: 'pty', harness: 'claude' }],
    },
    address: { address: 'devbox', destination: 'devbox', host: 'devbox' },
    labels: new Set(['claude']),
    workspaceLabel: 'claude',
    workspaceDir: '/srv/proj/.janissary/workspace/claude',
    attach: { active: false },
    ...overrides,
  } as unknown as RemoteEntry;
}

type Harness = {
  sessions: SessionsManager;
  detach: ReturnType<typeof vi.fn>;
  closeTab: ReturnType<typeof vi.fn>;
  entries: RemoteEntry[];
};

const created: SessionsManager[] = [];

function harness(
  live: RemoteEntry[] = [], sessionsTab?: { label: string }, open: string[] = ['claude'],
): Harness {
  initRemoteSessionStore(mkdtempSync(path.join(tmpdir(), 'janus-sessions-mgr-')));
  const entries = [...live];
  const detach = vi.fn((label: string) => {
    const index = entries.findIndex((candidate) => candidate.labels.has(label));
    if (index === -1 || !entries[index].workspaceDir) return false;
    entries.splice(index, 1);
    return true;
  });
  const closeTab = vi.fn();
  const tabs: { label: string; view: string; dotColor?: string; group?: number; groupColor?: string; plugin?: { id: string } }[] = open
    .map((label) => ({ label, view: 'harness', dotColor: '#111', group: 1, groupColor: '#111' }));
  if (sessionsTab) tabs.push({ label: sessionsTab.label, view: 'plugin', plugin: { id: 'sessions' } });
  const managers = {
    remote: { liveEntries: () => entries, detach, close: vi.fn() },
    tab: {
      tabs,
      byLabel: (label: string) => (open.includes(label)
        ? { label, view: 'harness', title: undefined }
        : undefined),
      findIndex: (label: string) => (open.includes(label) ? open.indexOf(label) : -1),
      closeTab,
      setActiveTab: vi.fn(),
      cur: () => ({ label: 'janus' }),
    },
  } as unknown as Managers;
  const sessions = new SessionsManager(managers);
  // Every manager subscribes to the global bus, so one left alive would mirror its own entries into
  // the next case's store the moment that case raises the signal.
  created.push(sessions);
  return { sessions, detach, closeTab, entries };
}

function settle(outcome: AttachOutcome): void {
  vi.mocked(startSessionAttach).mockResolvedValue(outcome);
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { for (const sessions of created) sessions.dispose(); created.length = 0; });

describe('SessionsManager view', () => {
  it('lists a live channel as an active row', () => {
    const h = harness([entry()]);
    const rows = h.sessions.view();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: 'claude', state: 'active', kind: 'harness' });
  });

  it('lists a record with no live channel as detached', () => {
    const h = harness();
    saveRemoteSessions([record()]);
    expect(h.sessions.view()[0]).toMatchObject({ state: 'detached', session: SESSION });
  });

  // The record is a mirror of what is live, so there is no separate "remember this" step that a
  // crash could land in front of.
  it('writes a record for a live channel as a side effect of composing the list', () => {
    const h = harness([entry()]);
    h.sessions.view();
    expect(loadRemoteSessions()).toMatchObject([{ session: SESSION, launchLabel: 'claude' }]);
  });

  it('writes no record for a channel still provisioning', () => {
    const h = harness([entry({ workspaceDir: undefined })]);
    h.sessions.view();
    expect(loadRemoteSessions()).toEqual([]);
  });

  // The record follows the live set rather than a read of the list: a session launched while this
  // tab is shut has to be recorded all the same, or a crash leaves a peer nothing can find.
  it('writes a record when the live set moves, with no call to view()', () => {
    harness([entry()]);
    messageBus.emit('sessions', { type: 'changed' });
    expect(loadRemoteSessions()).toMatchObject([{ session: SESSION, launchLabel: 'claude' }]);
  });

  it('writes no record for a still-provisioning channel when the live set moves', () => {
    harness([entry({ workspaceDir: undefined })]);
    messageBus.emit('sessions', { type: 'changed' });
    expect(loadRemoteSessions()).toEqual([]);
  });

  it('shows a live session once, never as both active and detached', () => {
    const h = harness([entry()]);
    saveRemoteSessions([record()]);
    const rows = h.sessions.view();
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe('active');
  });

  // A closed entry is nobody's session — its channel finished, and `terminateRemoteEntry` was the
  // one to drop the record. Re-mirroring it would undo that drop and put the detached row back.
  it('lets a closed entry write no record and resurrect none', () => {
    const h = harness([entry({ closed: true }) as unknown as RemoteEntry]);
    saveRemoteSessions([record()]);
    expect(h.sessions.view()).toHaveLength(1);
    expect(h.sessions.view()[0].state).toBe('detached');
    expect(loadRemoteSessions()).toHaveLength(1);
  });
});

describe('SessionsManager dropSession', () => {
  it('removes the record from memory and from the file, and the row with it', () => {
    const h = harness();
    saveRemoteSessions([record()]);
    h.sessions.dropSession(SESSION);
    expect(loadRemoteSessions()).toEqual([]);
    expect(h.sessions.view()).toEqual([]);
  });

  it('does nothing for a session it holds no record of', () => {
    const h = harness();
    saveRemoteSessions([record()]);
    h.sessions.dropSession('other-session');
    expect(loadRemoteSessions()).toMatchObject([{ session: SESSION }]);
  });
});

describe('SessionsManager detach', () => {
  it('parks the session and closes every tab holding it', () => {
    const h = harness([entry({ labels: new Set(['claude', 'bekir']) })]);
    h.sessions.view();

    expect(h.sessions.detach('claude')).toBe(true);
    expect(h.detach).toHaveBeenCalledWith('claude');
    expect(h.closeTab).toHaveBeenCalled();
  });

  // The frames `finish()` sends are exactly what a detach must not send. The manager reaches them
  // only through `RemoteManager.detach`, which withholds them — so asserting the call went there,
  // and that no tab close preceded it, is what pins the order that makes it true.
  it('takes the entry out of the table before closing any tab', () => {
    const order: string[] = [];
    const h = harness([entry()]);
    h.detach.mockImplementation(() => { order.push('detach'); return true; });
    h.closeTab.mockImplementation(() => { order.push('closeTab'); });
    h.sessions.detach('claude');
    expect(order).toEqual(['detach', 'closeTab']);
  });

  // The launching tab is closed; the joined one keeps the channel alive. The detach raised on the
  // surviving row must reach `RemoteManager.detach` — which withholds `finish()`'s frames — before
  // any tab close, exactly as a detach from the launching row does.
  it('parks from a surviving row with the frames withheld, when the launching tab is gone', () => {
    const order: string[] = [];
    const h = harness([entry({ labels: new Set(['claude', 'bekir']) })], undefined, ['bekir']);
    h.sessions.view();
    expect(h.sessions.view().map((row) => row.label)).toEqual(['bekir']);
    h.detach.mockImplementation((label: string) => {
      order.push(`detach:${label}`);
      const index = h.entries.findIndex((candidate) => candidate.labels.has(label));
      if (index !== -1) h.entries.splice(index, 1);
      return true;
    });
    h.closeTab.mockImplementation(() => { order.push('closeTab'); });
    expect(h.sessions.detach('bekir')).toBe(true);
    expect(order).toEqual(['detach:bekir', 'closeTab']);
    expect(loadRemoteSessions()).toHaveLength(1);
    expect(h.sessions.view()[0]).toMatchObject({ state: 'detached' });
  });

  it('leaves the record in place, so the row becomes detached rather than disappearing', () => {
    const h = harness([entry()]);
    h.sessions.view();
    h.sessions.detach('claude');
    expect(loadRemoteSessions()).toHaveLength(1);
    expect(h.sessions.view()[0].state).toBe('detached');
  });

  // Decision 12: there is nothing to come back to yet.
  it('is refused while the workspace is still provisioning', () => {
    const h = harness([entry({ workspaceDir: undefined })]);
    expect(h.sessions.detach('claude')).toBe(false);
    expect(h.closeTab).not.toHaveBeenCalled();
  });

  it('is refused for a label it does not hold', () => {
    const h = harness([entry()]);
    expect(h.sessions.detach('nothing-here')).toBe(false);
  });

  // Plan item 12: the feed's provenance header names the surface the change belongs to, not
  // whatever tab the user happens to be reading — so a detach raised from a metadata row while the
  // sessions tab sits open but unfocused names the sessions tab.
  it('attributes its line to the open sessions tab rather than the active tab', () => {
    const h = harness([entry()], { label: 'sessions-2' });
    h.sessions.detach('claude');
    expect(notify).toHaveBeenCalledWith(
      expect.anything(), 'remote-session', 'sessions-2', expect.anything(),
    );
  });

  // The metadata-row path: it reaches the manager through the controller without the list ever being
  // composed, and composing the list is what used to be the only thing that wrote the record. Parked
  // with none, the peer would hold its workspace for a week with nothing able to list it.
  it('records the session even when the list was never composed', () => {
    const h = harness([entry()]);
    expect(h.sessions.detach('claude')).toBe(true);
    expect(loadRemoteSessions()).toMatchObject([{ session: SESSION, launchLabel: 'claude' }]);
    expect(h.sessions.view()[0]).toMatchObject({ state: 'detached', session: SESSION });
  });

  // A peer whose workspace holds nothing answers `session-state` with an empty list, which an attach
  // reads as "this session is over" — so there is nothing to come back to and the transport stays.
  it('is refused for a channel with nothing running in its workspace', () => {
    const h = harness([entry({
      channel: { sessionId: SESSION, spawnedProcesses: () => [] },
    } as unknown as Partial<RemoteEntry>)]);
    expect(h.sessions.detach('claude')).toBe(false);
    expect(h.detach).not.toHaveBeenCalled();
    expect(h.closeTab).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.anything(), 'remote-session', 'janus',
      'claude on devbox cannot be detached — nothing is running in its workspace to come back to.',
    );
  });

  it('gives a still-provisioning session its own refusal wording', () => {
    const h = harness([entry({ workspaceDir: undefined })]);
    expect(h.sessions.detach('claude')).toBe(false);
    expect(notify).toHaveBeenCalledWith(
      expect.anything(), 'remote-session', 'janus',
      'claude on devbox cannot be detached yet — its workspace is still being prepared.',
    );
  });
});

// A row authorises a verb only when it offers it. Recorded labels are ordinary harness names, so a
// parked row named `claude` sitting beside a live tab named `claude` is a likely collision rather
// than a contrived one — and the parked row offers attach, never close.
describe('SessionsManager offers', () => {
  it('authorises a verb the matching row lists', () => {
    const h = harness([entry()]);
    expect(h.sessions.offers('detach', { label: 'claude' })).toMatchObject({ label: 'claude' });
  });

  it('refuses close on a parked row whose label a live tab shares', () => {
    const h = harness();
    saveRemoteSessions([record()]);
    expect(h.sessions.view()[0]).toMatchObject({ state: 'detached', label: 'claude' });
    expect(h.sessions.offers('close', { label: 'claude' })).toBeUndefined();
  });

  it('refuses detach on a row that is not the launching one', () => {
    const h = harness([entry({ labels: new Set(['claude', 'bekir']) })]);
    expect(h.sessions.offers('detach', { label: 'bekir' })).toBeUndefined();
  });

  it('hands the channel verbs to a surviving row when the launching tab is closed', () => {
    const h = harness([entry({ labels: new Set(['claude', 'bekir']) })], undefined, ['bekir']);
    expect(h.sessions.offers('detach', { label: 'bekir' })).toMatchObject({ label: 'bekir' });
  });

  it('refuses a verb for a label no row names at all', () => {
    const h = harness([entry()]);
    expect(h.sessions.offers('focus', { label: 'nothing-here' })).toBeUndefined();
  });
});

describe('SessionsManager attachTab', () => {
  it('collapses the backoff on a live entry', () => {
    const h = harness([entry()]);
    expect(h.sessions.attachTab('claude')).toBe(true);
  });

  // The only way to press this and hit no live entry is a tab whose channel has already gone, which
  // is exactly when the user needs telling: a control that declines without a word reads as broken.
  it('reports a refusal for a tab whose channel is gone', () => {
    const h = harness();
    expect(h.sessions.attachTab('claude')).toBe(false);
    expect(notify).toHaveBeenCalledWith(
      expect.anything(), 'remote-session', 'claude',
      'claude cannot be attached — its remote connection is gone.',
    );
  });
});

describe('SessionsManager attach', () => {
  it('reports connection failures to the sessions notification feed and preserves the record', async () => {
    const h = harness([], { label: 'sessions' });
    saveRemoteSessions([record()]);
    settle({ kind: 'failed', reason: 'Connection timed out' });
    h.sessions.attach(SESSION);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledExactlyOnceWith(
      expect.anything(), 'remote-session', 'sessions',
      'claude on devbox could not be attached: Connection timed out',
    ));
    expect(h.sessions.view()[0]).toMatchObject({ state: 'detached', failure: 'Connection timed out' });
    expect(loadRemoteSessions()).toHaveLength(1);
  });

  it('reports unexpected attach rejections and keeps the session available to retry', async () => {
    const h = harness();
    saveRemoteSessions([record()]);
    vi.mocked(startSessionAttach).mockRejectedValue(new Error('SSH could not start'));
    h.sessions.attach(SESSION);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledExactlyOnceWith(
      expect.anything(), 'remote-session', 'janus',
      'claude on devbox could not be attached: SSH could not start',
    ));
    expect(h.sessions.view()[0]).toMatchObject({ state: 'detached', failure: 'SSH could not start' });
    expect(loadRemoteSessions()).toHaveLength(1);
  });

  it('clears a recorded failure once the peer takes it back', async () => {
    const h = harness();
    saveRemoteSessions([record()]);
    settle({ kind: 'failed', reason: 'devbox: Connection timed out' });
    h.sessions.attach(SESSION);
    await vi.waitFor(() => expect(h.sessions.view()[0].failure).toBe('devbox: Connection timed out'));

    settle({ kind: 'attached', label: 'claude' });
    h.sessions.attach(SESSION);
    await vi.waitFor(() => expect(h.sessions.view()[0].failure).toBeUndefined());
  });

  // A connection that never gets an answer establishes nothing, so the record survives and the row
  // keeps its attach button — with a trash button now beside it.
  it('leaves a failed attempt detached, with its reason and a trash button on the row', async () => {
    const h = harness();
    saveRemoteSessions([record()]);
    settle({ kind: 'failed', reason: 'devbox: No route to host' });
    h.sessions.attach(SESSION);

    await vi.waitFor(() => {
      const row = h.sessions.view()[0];
      expect(row.state).toBe('detached');
      expect(row.failure).toBe('devbox: No route to host');
      expect(row.actions).toContain('forget');
    });
    expect(loadRemoteSessions()).toHaveLength(1);
  });

  // A peer that answers is a peer that is there; refusing establishes the session is over.
  it('drops the record and leaves a terminated row when the peer refuses', async () => {
    const h = harness();
    saveRemoteSessions([record()]);
    settle({ kind: 'terminated', reason: 'claude on devbox is no longer running.' });
    h.sessions.attach(SESSION);

    await vi.waitFor(() => expect(h.sessions.view()[0].state).toBe('terminated'));
    expect(loadRemoteSessions()).toEqual([]);
  });

  // Exactly one line for the event: whatever the remote layer would have had to say about the same
  // ending is muted, so the feed never teaches its lines cannot be taken at their word.
  it('records exactly one notification for an attach that ends the session', async () => {
    const h = harness();
    saveRemoteSessions([record()]);
    settle({ kind: 'terminated', reason: 'claude on devbox is no longer running.' });
    h.sessions.attach(SESSION);

    await vi.waitFor(() => expect(h.sessions.view()[0].state).toBe('terminated'));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.anything(), 'remote-session', 'janus', 'claude on devbox terminated.');
  });

  it('is refused for a session it has no record of', () => {
    expect(harness().sessions.attach('no-such-session')).toBe(false);
    expect(startSessionAttach).not.toHaveBeenCalled();
  });
});

describe('SessionsManager end', () => {
  it('drops the record and leaves a terminated row when the peer is stopped', async () => {
    const h = harness();
    saveRemoteSessions([record()]);
    vi.mocked(terminateParkedSession).mockResolvedValue({ terminated: true } satisfies TerminateOutcome);
    h.sessions.terminate(SESSION);

    await vi.waitFor(() => expect(h.sessions.view()[0].state).toBe('terminated'));
    expect(loadRemoteSessions()).toEqual([]);
  });

  // The end action is the narrator for an end it pressed, and one event is one line.
  it('records exactly one notification for a successful end', async () => {
    const h = harness();
    saveRemoteSessions([record()]);
    vi.mocked(terminateParkedSession).mockResolvedValue({ terminated: true } satisfies TerminateOutcome);
    h.sessions.terminate(SESSION);

    await vi.waitFor(() => expect(h.sessions.view()[0].state).toBe('terminated'));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('keeps the record when the host could not be reached', async () => {
    const h = harness();
    saveRemoteSessions([record()]);
    vi.mocked(terminateParkedSession).mockResolvedValue({ terminated: false, reason: 'devbox: timed out' });
    h.sessions.terminate(SESSION);

    await vi.waitFor(() => expect(h.sessions.view()[0].failure).toBe('devbox: timed out'));
    expect(loadRemoteSessions()).toHaveLength(1);
  });

  // The attempt has to reach the host before it can say anything, which on a slow one is minutes. A
  // row that vanished for the duration read as a completed end, and came back later holding a
  // workspace the user believed was gone.
  it('keeps the row on screen, marked ending, while the attempt is unresolved', () => {
    const h = harness();
    saveRemoteSessions([record()]);
    vi.mocked(terminateParkedSession).mockReturnValue(new Promise(() => {}));
    h.sessions.terminate(SESSION);

    const rows = h.sessions.view();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: 'detached', session: SESSION, terminating: true });
  });

  // The end channel is opened under a synthetic label carrying the record's session id. Counted as a
  // live session it filtered the record out, and holding no tab it composed a group the list drops.
  it('does not list the end attempt\'s own channel as a live session', () => {
    const h = harness();
    saveRemoteSessions([record()]);
    vi.mocked(terminateParkedSession).mockImplementation(() => {
      h.entries.push(entry({ labels: new Set([`terminate-session:${SESSION}`]) }));
      return new Promise(() => {});
    });
    h.sessions.terminate(SESSION);

    const rows = h.sessions.view();
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe('detached');
  });

  it('stops claiming to be ending once the attempt fails', async () => {
    const h = harness();
    saveRemoteSessions([record()]);
    vi.mocked(terminateParkedSession).mockResolvedValue({ terminated: false, reason: 'devbox: timed out' });
    h.sessions.terminate(SESSION);

    await vi.waitFor(() => expect(h.sessions.view()[0].failure).toBe('devbox: timed out'));
    expect(h.sessions.view()[0].ending).toBeUndefined();
  });
});

describe('SessionsManager forget', () => {
  // Forgetting removes janissary's own record and touches nothing on the far side.
  it('drops the record and the row without speaking to the host', () => {
    const h = harness();
    saveRemoteSessions([record()]);
    expect(h.sessions.forget(SESSION)).toBe(true);
    expect(loadRemoteSessions()).toEqual([]);
    expect(h.sessions.view()).toEqual([]);
    expect(terminateParkedSession).not.toHaveBeenCalled();
    expect(startSessionAttach).not.toHaveBeenCalled();
  });

  it('clears a terminated row too, which is the only thing left to clear', async () => {
    const h = harness();
    saveRemoteSessions([record()]);
    settle({ kind: 'terminated', reason: 'gone' });
    h.sessions.attach(SESSION);
    await vi.waitFor(() => expect(h.sessions.view()).toHaveLength(1));

    h.sessions.forget(SESSION);
    expect(h.sessions.view()).toEqual([]);
  });
});

describe('SessionsManager change signal', () => {
  function listen(): () => number {
    let count = 0;
    const subscription = messageBus.on('sessions', 'changed', () => { count++; });
    return () => { subscription.unsubscribe(); return count; };
  }

  it('fires on a detach', () => {
    const h = harness([entry()]);
    const stop = listen();
    h.sessions.detach('claude');
    expect(stop()).toBe(1);
  });

  it('fires on a forget', () => {
    const h = harness();
    saveRemoteSessions([record()]);
    const stop = listen();
    h.sessions.forget(SESSION);
    expect(stop()).toBe(1);
  });

  it('fires on a refresh, which speaks to no host', () => {
    const h = harness();
    const stop = listen();
    h.sessions.refresh();
    expect(stop()).toBe(1);
  });

  it('does not fire for an action naming something it does not hold', () => {
    const h = harness();
    const stop = listen();
    h.sessions.detach('nothing-here');
    expect(stop()).toBe(0);
  });
});

describe('SessionsManager restoreAll', () => {
  // Each session is attached on its own: a refusing peer is marked terminated and an unreachable host
  // stays detached, and neither holds the restore up.
  it('attaches every recorded session independently', () => {
    const h = harness();
    saveRemoteSessions([record(), record({ session: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })]);
    settle({ kind: 'attached', label: 'claude' });

    h.sessions.restoreAll();
    expect(startSessionAttach).toHaveBeenCalledTimes(2);
  });

  it('does nothing when nothing is parked', () => {
    harness().sessions.restoreAll();
    expect(startSessionAttach).not.toHaveBeenCalled();
  });
});
