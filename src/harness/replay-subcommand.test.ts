import { describe, expect, it, vi } from 'vitest';
import { replaySubcommand } from './subcommands.js';
import { notify } from '../notifications/index.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));

// A harness tab whose recorder is writing, a tab that has produced nothing yet, and a plain tab.
const tabs = [
  { label: 'janus', log: [] },
  { label: 'claude', harness: { name: 'claude', ptyId: 'pty-1' } },
  { label: 'fresh', harness: { name: 'codex', ptyId: 'pty-2' } },
  { label: 'plain' },
] as unknown as Tab[];

function makeManagers(recording?: string): Managers {
  const runCoreRoute = vi.fn(async () => true);
  const managers = {
    tab: {
      tabs,
      cur: () => tabs[0],
      byLabel: (label: string) => tabs.find((tab) => tab.label === label),
      cwdOf: () => '/project',
      launchDir: '/project',
      append: vi.fn(),
    },
    harness: { recordingPathOf: vi.fn(() => recording) },
    plugins: { runCoreRoute },
  } as unknown as Managers;
  return Object.assign(managers, { runCoreRoute });
}

describe('replaySubcommand', () => {
  it('routes a resolved recording into the plugin that owns the route', () => {
    const managers = makeManagers('/recordings/claude.cast');
    replaySubcommand(managers, 'claude', 'janus', 'harness replay claude');
    expect(managers.runCoreRoute).toHaveBeenCalledWith(
      'replay', '/recordings/claude.cast', { label: 'janus', command: 'harness replay claude' },
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports a target that names neither an open tab nor a file, to the feed and not the transcript', () => {
    const managers = makeManagers();
    replaySubcommand(managers, 'nope', 'janus', 'harness replay nope');
    expect(managers.runCoreRoute).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.anything(), 'replay-unavailable', 'janus',
      'No recording found for "nope".');
  });

  it('distinguishes a tab that has produced no output yet from one that does not exist', () => {
    const managers = makeManagers();
    replaySubcommand(managers, 'fresh', 'janus', 'harness replay fresh');
    expect(notify).toHaveBeenCalledWith(expect.anything(), 'replay-unavailable', 'janus',
      'No recording available for "fresh" yet.');
  });

  it('refuses a tab that does not record at all', () => {
    const managers = makeManagers();
    replaySubcommand(managers, 'plain', 'janus', 'harness replay plain');
    expect(notify).toHaveBeenCalledWith(expect.anything(), 'replay-unavailable', 'janus',
      'No recording found for "plain".');
  });

  it('says the replay is unavailable when no active plugin claims the route', async () => {
    const managers = makeManagers('/recordings/claude.cast');
    managers.runCoreRoute.mockResolvedValueOnce(false as never);
    replaySubcommand(managers, 'claude', 'janus', 'harness replay claude');
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(expect.anything(), 'replay-unavailable',
      'janus', 'Replay is unavailable.'));
  });
});