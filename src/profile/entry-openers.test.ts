import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openAgentEntry, openHarnessEntry } from './entry-openers.js';
import type { AgentState } from '../agent/types.js';
import type { Managers } from '../managers.js';
import type { ProfileHarnessEntry } from './types.js';
import type { RemoteLaunchHandlers } from '../remote/entry-factory.js';

// `profile launch`'s per-entry openers. `save/index.test.ts` drives them through a whole profile,
// which never reaches the entries that carry a saved context or schedule, the one whose harness
// refuses to open, or the line a ready remote agent reports on.

const ISSUING = { label: 'janus', cwd: '/project' };

function harness(overrides: {
  openFromProfile?: (...args: unknown[]) => string | undefined;
  schedule?: { set: ReturnType<typeof vi.fn> };
} = {}) {
  const tabs: unknown[] = [];
  const appended: { label: string; output: string }[] = [];
  const setCwd = vi.fn();
  const setContext = vi.fn();
  const scheduleSet = overrides.schedule?.set ?? vi.fn();
  const managers = {
    tab: {
      tabs,
      launchDir: '/project',
      allLabels: () => tabs.map((tab) => (tab as { label: string }).label),
      byLabel: (label: string) => tabs.find((tab) => (tab as { label: string }).label === label),
      insertTabInGroup: (tab: unknown) => { tabs.push(tab); return tabs; },
      setCwd,
      setContext,
      append: vi.fn((label: string, entry: { output: string }) => { appended.push({ label, output: entry.output }); }),
      persist: vi.fn(),
      buildAgentState: vi.fn(() => ({})),
      addBusy: vi.fn(),
      deleteBusy: vi.fn(),
      findIndex: () => 0,
      setActiveTab: vi.fn(),
      shorten: (value: string) => value,
    },
    schedule: { set: scheduleSet },
    harness: { openFromProfile: overrides.openFromProfile ?? vi.fn() },
    sessions: { view: vi.fn(() => []) },
    shell: { ensure: vi.fn() },
    notifications: { openFeed: vi.fn() },
  } as unknown as Managers;
  return { managers, tabs, appended, setCwd, setContext, scheduleSet };
}

function agentState(overrides: Partial<AgentState> = {}): AgentState {
  return { name: 'alpha', dotColor: '#fff', active: false, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('openAgentEntry', () => {
  it('restores a saved context onto the tab it opens', () => {
    const h = harness();

    expect(openAgentEntry(agentState({ context: ['remember this'] }), h.managers, 1, '#fff', '#fff', 'janus'))
      .toBeUndefined();

    expect(h.setContext).toHaveBeenCalledWith('alpha', ['remember this']);
  });

  it('restores a saved schedule onto the tab it opens', () => {
    const h = harness();
    const schedule = [{ id: 's1', command: 'echo hi', spec: 'once', nextRun: 0, recurring: false }] as never;

    expect(openAgentEntry(agentState({ schedule }), h.managers, 1, '#fff', '#fff', 'janus')).toBeUndefined();

    expect(h.scheduleSet).toHaveBeenCalledWith('alpha', schedule);
  });

  it('restores neither when the entry carries neither', () => {
    const h = harness();

    openAgentEntry(agentState(), h.managers, 1, '#fff', '#fff', 'janus');

    expect(h.setContext).not.toHaveBeenCalled();
    expect(h.scheduleSet).not.toHaveBeenCalled();
  });

  it('expands a saved cwd against the launch directory before setting it', () => {
    const h = harness();

    openAgentEntry(agentState({ cwd: '$root/src' }), h.managers, 1, '#fff', '#fff', 'janus');

    expect(h.setCwd).toHaveBeenCalledWith('alpha', '/project/src');
  });
});

describe('openHarnessEntry', () => {
  function entry(overrides: Partial<ProfileHarnessEntry> = {}): ProfileHarnessEntry {
    return { type: 'harness', name: 'work', tool: 'claude', ...overrides } as ProfileHarnessEntry;
  }

  // The opener's error is the profile launch's note for that entry, so a harness that refuses to
  // open must be reported rather than skipped silently — the launch carries on with the next entry.
  it('reports a harness that refuses to open and sets no schedule', () => {
    const h = harness({ openFromProfile: vi.fn(() => 'workspace clone failed') });
    const notes: string[] = [];

    expect(openHarnessEntry(entry(), h.managers, 1, '#fff', ISSUING, notes)).toBe('workspace clone failed');
    expect(notes).toEqual([]);
  });

  it('rejects a tool it does not know', () => {
    const h = harness();

    expect(openHarnessEntry(entry({ tool: 'nope' as never }), h.managers, 1, '#fff', ISSUING, []))
      .toBe('unknown tool "nope"');
  });

  it('rejects autoApprove for a harness that cannot take it', () => {
    const h = harness();

    expect(openHarnessEntry(entry({ tool: 'opencode', autoApprove: true }), h.managers, 1, '#fff', ISSUING, []))
      .toBe('autoApprove (-y) is only supported for the claude and codex harnesses');
  });

  it('installs a schedule when the entry carries one, and none when it does not', () => {
    const withSchedule = harness();
    expect(openHarnessEntry(entry({ schedule: ['standup every 1d echo hi'] }), withSchedule.managers, 1, '#fff', ISSUING, []))
      .toBeUndefined();
    expect(withSchedule.scheduleSet).toHaveBeenCalledWith('work', expect.arrayContaining([
      expect.objectContaining({ command: 'echo hi' }),
    ]));

    const without = harness();
    openHarnessEntry(entry(), without.managers, 1, '#fff', ISSUING, []);
    expect(without.scheduleSet).not.toHaveBeenCalled();
  });
});

// A remote agent reports its own readiness and its own failures through one `out` channel the opener
// hands over, because the tab takes over full-screen for ssh's own prompts and the transcript has to
// say what happened. Nothing else in the suite reaches that line, because every other remote-agent
// test starts the launch itself rather than going through a profile entry.
describe('openAgentEntry for a remote entry', () => {
  function remoteManagers() {
    let handlers: RemoteLaunchHandlers = {};
    const tabs: { label: string }[] = [];
    const cur = vi.fn(() => ({ label: 'alpha' }));
    const notifications = {
      append: vi.fn((held: unknown) => ({ held, repeated: false })),
      isBurst: vi.fn(() => false),
      view: vi.fn(() => []),
    };
    const managers = {
      tab: {
        tabs,
        cur,
        launchDir: '/project',
        allLabels: () => tabs.map((tab) => tab.label),
        byLabel: (label: string) => tabs.find((tab) => tab.label === label),
        insertTabInGroup: (tab: { label: string }) => { tabs.push(tab); return tabs; },
        setCwd: vi.fn(),
        setContext: vi.fn(),
        append: vi.fn(),
        persist: vi.fn(),
        buildAgentState: vi.fn(() => ({})),
        addBusy: vi.fn(),
        deleteBusy: vi.fn(),
        findIndex: () => 0,
        setActiveTab: vi.fn(),
        shorten: (value: string) => value,
      },
      notifications,
      remote: {
        create: vi.fn((_label: string, _address: unknown, _cwd: string, given: RemoteLaunchHandlers) => {
          handlers = given;
          return { ptyId: 'pty-1' };
        }),
      },
      shell: { ensure: vi.fn() },
      schedule: { set: vi.fn() },
      sessions: { view: vi.fn(() => []) },
    } as unknown as Managers;
    return { managers, handlers: () => handlers, cur, notifications };
  }

  it('opens a remote entry without restoring a local cwd or context', () => {
    const h = remoteManagers();

    const error = openAgentEntry(
      agentState({ remote: 'devbox:/srv/project', cwd: '$root/src', context: ['stale'] }),
      h.managers, 1, '#fff', '#fff', 'janus',
    );

    expect(error).toBeUndefined();
    // The tab is rooted at the launch directory, never at a path from the profile that only exists
    // on the far host.
    expect(h.managers.tab.setCwd).not.toHaveBeenCalledWith('alpha', '/project/src');
    expect(h.managers.tab.setContext).not.toHaveBeenCalled();
  });

  it('reports a remote launch that fails through the out channel it was handed', async () => {
    const h = remoteManagers();
    openAgentEntry(agentState({ remote: 'devbox:/srv/project' }), h.managers, 1, '#fff', '#fff', 'janus');

    h.handlers().onFailed?.('connection reset');

    // `append` here is `notifications.append`, reached only through the opener's `out`.
    await vi.waitFor(() => expect(h.notifications.append).toHaveBeenCalled());
  });
});

// A remote entry's address is re-validated at launch, because a profile file is hand-authored and a
// stale one can name a destination that no longer parses.
describe('openAgentEntry for an unparseable remote address', () => {
  it('reports the address error and opens nothing', () => {
    const h = harness();

    expect(openAgentEntry(agentState({ remote: 'not an address' }), h.managers, 1, '#fff', '#fff', 'janus'))
      .toBeTypeOf('string');
    expect(h.tabs).toEqual([]);
  });
});
