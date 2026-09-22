import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureSubcommand, transcriptSubcommand } from './subcommands.js';
import { writeCaptureFile } from './capture-file.js';
import { queryParkedCapture } from './capture-remote.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

// `captureSubcommand`/`resolveHarnessTab` have no dedicated test file today — the remote/detached
// resolution the auto-accept-while-detached plan adds (decisions 15-16) is covered here.

vi.mock('./capture-file.js', () => ({ writeCaptureFile: vi.fn(() => '/project/.janissary/captures/claude-now.txt') }));
vi.mock('./capture-remote.js', () => ({ queryParkedCapture: vi.fn() }));

// Stands in for "nothing captured locally" wherever a test doesn't care about the local path.
function noCapture(): undefined { /* nothing captured */ }

function makeManagers(tabs: Tab[], overrides: Partial<{
  reconnecting: boolean; channel: unknown; record: unknown;
}> = {}): Managers & { edit: ReturnType<typeof vi.fn>; append: ReturnType<typeof vi.fn> } {
  const edit = vi.fn();
  const append = vi.fn();
  const managers = {
    tab: {
      tabs,
      cur: () => tabs[0],
      byLabel: (label: string) => tabs.find((t) => t.label === label),
      append,
    },
    remote: {
      reconnectingOf: vi.fn(() => overrides.reconnecting ?? false),
      get: vi.fn(() => overrides.channel),
    },
    sessions: {
      recordForProcess: vi.fn(() => overrides.record),
    },
    openFile: { edit },
  } as unknown as Managers;
  return Object.assign(managers, { edit, append });
}

describe('captureSubcommand — local tab (unchanged)', () => {
  beforeEach(() => { vi.mocked(writeCaptureFile).mockClear(); });

  it('errors when no tab has the label and no persisted record matches', () => {
    const managers = makeManagers([{ label: 'janus', log: [] } as unknown as Tab]);
    expect(captureSubcommand(managers, noCapture, 'harness capture nope', 'nope')).toBe('No tab labeled "nope".');
  });

  it('errors when the tab is not a harness tab', () => {
    const tabs = [{ label: 'janus', log: [] }, { label: 'plain' }] as unknown as Tab[];
    const managers = makeManagers(tabs);
    expect(captureSubcommand(managers, noCapture, 'harness capture plain', 'plain')).toBe('"plain" is not a harness tab.');
  });

  it('errors when the local tab has no capture yet', () => {
    const tabs = [{ label: 'janus', log: [] }, { label: 'claude', harness: { ptyId: 'pty-1' } }] as unknown as Tab[];
    const managers = makeManagers(tabs);
    expect(captureSubcommand(managers, noCapture, 'harness capture claude', 'claude')).toBe('No capture available for "claude" yet.');
  });

  it('writes the file and opens it synchronously for a local capture', () => {
    const tabs = [{ label: 'janus', log: [] }, { label: 'claude', harness: { ptyId: 'pty-1' } }] as unknown as Tab[];
    const managers = makeManagers(tabs);
    const latest = { text: 'screen', capturedAt: 123 };
    expect(captureSubcommand(managers, () => latest, 'harness capture claude', 'claude')).toBeUndefined();
    expect(writeCaptureFile).toHaveBeenCalledWith('claude', 123, 'screen');
    expect(managers.edit).toHaveBeenCalledWith('harness capture claude', '/project/.janissary/captures/claude-now.txt', 'janus');
  });
});

describe('captureSubcommand — open remote tab', () => {
  beforeEach(() => { vi.mocked(writeCaptureFile).mockClear(); });

  it('fails immediately for a reconnecting tab, without touching the channel', () => {
    const requestCapture = vi.fn();
    const tabs = [
      { label: 'janus', log: [] },
      { label: 'claude', harness: { ptyId: 'r1' }, remote: { address: 'host', host: 'host' } },
    ] as unknown as Tab[];
    const managers = makeManagers(tabs, { reconnecting: true, channel: { requestCapture, sessionId: 's1' } });
    expect(captureSubcommand(managers, noCapture, 'harness capture claude', 'claude'))
      .toBe('No capture available for "claude" — connection is reconnecting.');
    expect(requestCapture).not.toHaveBeenCalled();
  });

  it('round-trips the live channel\'s capture-request when attached, and opens the file once it settles', async () => {
    const requestCapture = vi.fn(() => Promise.resolve({ text: 'remote screen', capturedAt: 456 }));
    const tabs = [
      { label: 'janus', log: [] },
      { label: 'claude', harness: { ptyId: 'r1' }, remote: { address: 'host', host: 'host' } },
    ] as unknown as Tab[];
    const managers = makeManagers(tabs, { channel: { requestCapture, sessionId: 's1' } });
    const result = captureSubcommand(managers, noCapture, 'harness capture claude', 'claude');
    expect(result).toBeUndefined();
    expect(requestCapture).toHaveBeenCalledWith('r1', 's1');
    await Promise.resolve(); await Promise.resolve();
    expect(writeCaptureFile).toHaveBeenCalledWith('claude', 456, 'remote screen');
    expect(managers.edit).toHaveBeenCalledWith('harness capture claude', '/project/.janissary/captures/claude-now.txt', 'janus');
  });

  it('appends the "no capture" error to the invoking tab when the round trip resolves empty', async () => {
    const requestCapture = vi.fn(() => Promise.resolve());
    const tabs = [
      { label: 'janus', log: [] },
      { label: 'claude', harness: { ptyId: 'r1' }, remote: { address: 'host', host: 'host' } },
    ] as unknown as Tab[];
    const managers = makeManagers(tabs, { channel: { requestCapture, sessionId: 's1' } });
    captureSubcommand(managers, noCapture, 'harness capture claude', 'claude');
    await Promise.resolve(); await Promise.resolve();
    expect(managers.append).toHaveBeenCalledWith('janus', { input: '', output: 'No capture available for "claude" yet.' });
  });
});

describe('captureSubcommand — no open tab (detached)', () => {
  beforeEach(() => {
    vi.mocked(writeCaptureFile).mockClear();
    vi.mocked(queryParkedCapture).mockClear();
  });

  it('keeps the "No tab labeled" error when nothing matches an open tab or a persisted record', () => {
    const managers = makeManagers([{ label: 'janus', log: [] } as unknown as Tab], { record: undefined });
    expect(captureSubcommand(managers, noCapture, 'harness capture claude', 'claude')).toBe('No tab labeled "claude".');
    expect(queryParkedCapture).not.toHaveBeenCalled();
  });

  it('refuses an ambiguous detached label without querying either session', () => {
    const managers = makeManagers([{ label: 'janus', log: [] } as unknown as Tab], { record: 'ambiguous' });
    expect(captureSubcommand(managers, noCapture, 'harness capture claude', 'claude'))
      .toBe('Multiple detached sessions are labeled "claude". Attach the intended session before capturing.');
    expect(queryParkedCapture).not.toHaveBeenCalled();
  });

  it('resolves via the persisted process record and the one-off parked-peer query when no tab is open', async () => {
    vi.mocked(queryParkedCapture).mockResolvedValue({ text: 'parked screen', capturedAt: 789 });
    const record = { session: 's1', workspaceLabel: 'claude' };
    const process = { id: 'r1', label: 'claude', kind: 'harness' };
    const managers = makeManagers([{ label: 'janus', log: [] } as unknown as Tab], { record: { record, process } });
    const result = captureSubcommand(managers, noCapture, 'harness capture claude', 'claude');
    expect(result).toBeUndefined();
    expect(queryParkedCapture).toHaveBeenCalledWith(managers, record, 'r1');
    await Promise.resolve(); await Promise.resolve();
    expect(writeCaptureFile).toHaveBeenCalledWith('claude', 789, 'parked screen');
    expect(managers.edit).toHaveBeenCalledWith('harness capture claude', '/project/.janissary/captures/claude-now.txt', 'janus');
  });

  it('reports a detached-query failure in the invoking transcript', async () => {
    vi.mocked(queryParkedCapture).mockResolvedValue({ error: 'SSH authentication is disabled.' });
    const record = { session: 's1', workspaceLabel: 'claude' };
    const process = { id: 'r1', label: 'claude', kind: 'harness' };
    const managers = makeManagers([{ label: 'janus', log: [] } as unknown as Tab], { record: { record, process } });
    captureSubcommand(managers, noCapture, 'harness capture claude', 'claude');

    await Promise.resolve(); await Promise.resolve();
    expect(managers.append).toHaveBeenCalledWith('janus', {
      input: '', output: 'Detached capture query failed: SSH authentication is disabled.',
    });
  });
});

describe('transcriptSubcommand (unaffected by this plan)', () => {
  it('errors when no tab has the label', () => {
    const managers = makeManagers([{ label: 'janus', log: [] } as unknown as Tab]);
    expect(transcriptSubcommand(managers, noCapture, 'harness transcript nope', 'nope')).toBe('No tab labeled "nope".');
  });
});
