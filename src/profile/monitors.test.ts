import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startProfileMonitors } from './monitors.js';
import { initProfileDir } from '../profiles.js';
import type { Managers } from '../managers.js';

function makeManagers(): { managers: Managers; stop: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> } {
  const stop = vi.fn(() => true);
  const start = vi.fn<(...args: unknown[]) => string | null>(() => null);
  const managers = { monitor: { stop, start } } as unknown as Managers;
  return { managers, stop, start };
}

describe('startProfileMonitors', () => {
  let root: string;

  const writeMonitors = (profile: string, contents: string) => {
    const dir = path.join(root, 'profiles', profile);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '_monitors.json'), contents);
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-profmon-'));
    initProfileDir(root);
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('stops any prior same-owner monitor, then starts each and reports it', () => {
    writeMonitors('claude', JSON.stringify([{ persona: 'assistant', targets: ['group:1'] }]));
    const { managers, stop, start } = makeManagers();
    const notes: string[] = [];

    startProfileMonitors('claude', managers, 'janus', notes);

    expect(stop).toHaveBeenCalledWith('janus', 'assistant');
    expect(start).toHaveBeenCalledWith('janus', 'assistant', [{ kind: 'group', group: 1 }]);
    expect(notes).toEqual(['Monitoring group:1 (persona: assistant).']);
  });

  it('reports a start error without throwing', () => {
    writeMonitors('claude', JSON.stringify([{ persona: 'assistant', targets: ['group:9'] }]));
    const { managers, start } = makeManagers();
    start.mockReturnValue('No tab in group 9.');
    const notes: string[] = [];

    startProfileMonitors('claude', managers, 'janus', notes);

    expect(notes).toEqual(['Monitor "assistant": No tab in group 9.']);
  });

  it('reports a parse error and skips starting', () => {
    writeMonitors('claude', JSON.stringify([{ persona: 'assistant', targets: ['bad:target'] }]));
    const { managers, start } = makeManagers();
    const notes: string[] = [];

    startProfileMonitors('claude', managers, 'janus', notes);

    expect(start).not.toHaveBeenCalled();
    expect(notes[0]).toContain('Monitor "assistant":');
  });

  it('does nothing when the profile has no monitors', () => {
    const { managers, start } = makeManagers();
    const notes: string[] = [];

    startProfileMonitors('claude', managers, 'janus', notes);

    expect(start).not.toHaveBeenCalled();
    expect(notes).toEqual([]);
  });
});
