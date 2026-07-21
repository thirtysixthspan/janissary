import { describe, it, expect, vi } from 'vitest';
import { startProfileMonitors } from './monitors.js';
import type { Managers } from '../managers.js';
import type { ProfileMonitor } from '../types.js';

function makeManagers(): { managers: Managers; stop: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> } {
  const stop = vi.fn(() => true);
  const start = vi.fn<(...args: unknown[]) => string | null>(() => null);
  const managers = { monitor: { stop, start } } as unknown as Managers;
  return { managers, stop, start };
}

describe('startProfileMonitors', () => {
  it('stops any prior same-owner monitor, then starts each with its name and reports it', () => {
    const monitors: ProfileMonitor[] = [{ name: 'assistant', persona: 'assistant', targets: ['group:1'] }];
    const { managers, stop, start } = makeManagers();
    const notes: string[] = [];

    startProfileMonitors(monitors, managers, 'janus', notes);

    expect(stop).toHaveBeenCalledWith('janus', 'assistant');
    expect(start).toHaveBeenCalledWith('janus', 'assistant', [{ kind: 'group', group: 1 }], 'assistant');
    expect(notes).toEqual(['Monitoring group:1 (persona: assistant).']);
  });

  it('passes a distinct name so two same-persona monitors coexist', () => {
    const monitors: ProfileMonitor[] = [
      { name: 'watch-a', persona: 'assistant', targets: ['group:1'] },
      { name: 'watch-b', persona: 'assistant', targets: ['group:2'] },
    ];
    const { managers, start } = makeManagers();

    startProfileMonitors(monitors, managers, 'janus', []);

    expect(start).toHaveBeenCalledWith('janus', 'assistant', [{ kind: 'group', group: 1 }], 'watch-a');
    expect(start).toHaveBeenCalledWith('janus', 'assistant', [{ kind: 'group', group: 2 }], 'watch-b');
  });

  it('reports a start error without throwing', () => {
    const monitors: ProfileMonitor[] = [{ name: 'assistant', persona: 'assistant', targets: ['group:9'] }];
    const { managers, start } = makeManagers();
    start.mockReturnValue('No tab in group 9.');
    const notes: string[] = [];

    startProfileMonitors(monitors, managers, 'janus', notes);

    expect(notes).toEqual(['Monitor "assistant": No tab in group 9.']);
  });

  it('reports a parse error and skips starting', () => {
    const monitors: ProfileMonitor[] = [{ name: 'assistant', persona: 'assistant', targets: ['bad:target'] }];
    const { managers, start } = makeManagers();
    const notes: string[] = [];

    startProfileMonitors(monitors, managers, 'janus', notes);

    expect(start).not.toHaveBeenCalled();
    expect(notes[0]).toContain('Monitor "assistant":');
  });

  it('does nothing when there are no monitors', () => {
    const { managers, start } = makeManagers();
    const notes: string[] = [];

    startProfileMonitors([], managers, 'janus', notes);

    expect(start).not.toHaveBeenCalled();
    expect(notes).toEqual([]);
  });
});
