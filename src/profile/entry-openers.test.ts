import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openHarnessEntry } from './entry-openers.js';
import type { Managers } from '../managers.js';
import type { ProfileHarnessEntry } from './types.js';
import { supportsHarnessAutoApprove } from '../harness/auto-approve.js';
import type * as AutoApprove from '../harness/auto-approve.js';

// Every bundled harness has a gate detector, so the unsupported-autoApprove skip is reachable only by
// stubbing the support predicate; it otherwise passes through to the real gate table.
vi.mock('../harness/auto-approve.js', async (importOriginal) => {
  const actual = await importOriginal<typeof AutoApprove>();
  return { ...actual, supportsHarnessAutoApprove: vi.fn(actual.supportsHarnessAutoApprove) };
});

// `profile launch`'s per-entry opener. `save/index.test.ts` drives it through a whole profile,
// which never reaches the entry whose harness refuses to open.

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supportsHarnessAutoApprove).mockReset();
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
    vi.mocked(supportsHarnessAutoApprove).mockReturnValue(false);

    expect(openHarnessEntry(entry({ tool: 'opencode', autoApprove: true }), h.managers, 1, '#fff', ISSUING, []))
      .toMatch(/^autoApprove \(-y\) is only supported for the .+ harnesses$/);
    expect(h.managers.harness.openFromProfile).not.toHaveBeenCalled();
  });

  it('opens an opencode entry that asks for autoApprove', () => {
    const h = harness();

    expect(openHarnessEntry(entry({ tool: 'opencode', autoApprove: true }), h.managers, 1, '#fff', ISSUING, []))
      .toBeUndefined();
    expect(h.managers.harness.openFromProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'opencode', autoApprove: true }), expect.any(String), 1, '#fff', 'janus',
    );
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
