import { describe, it, expect, beforeEach } from 'vitest';
import { monitor, unmonitor, monitors } from './monitor.js';

describe('monitor command', () => {
  it('has the correct name', () => {
    expect(monitor.name).toBe('monitor');
  });

  it('matches "monitor" case-insensitively, with or without an argument', () => {
    expect(monitor.match('monitor')).toBe(true);
    expect(monitor.match('monitor bilal')).toBe(true);
    expect(monitor.match('MONITOR bilal')).toBe(true);
  });

  it('does not match non-monitor input', () => {
    expect(monitor.match('monitors')).toBe(false);
    expect(monitor.match('unmonitor bilal')).toBe(false);
  });
});

describe('monitor command run', () => {
  let appended: { input: string; output: string }[];
  let tab: { label: string; index: number };
  let managers: unknown;
  let askResult: string | null;
  let startResult: string | null;

  beforeEach(() => {
    appended = [];
    tab = { label: 'janus', index: 0 };
    askResult = null;
    startResult = null;
    managers = {
      tab: {
        append: (_label: string, entry: { input: string; output: string }) => {
          appended.push(entry);
        },
      },
      monitor: {
        ask: (_owner: string, _persona: string, _question: string) => askResult,
        start: (_owner: string, _persona: string, _targets: unknown[]) => startResult,
      },
    };
  });

  const run = (command_: string) => monitor.run(command_, tab, managers as never);

  it('reports a usage error for bare "monitor"', () => {
    run('monitor');
    expect(appended).toEqual([{ input: 'monitor', output: 'Usage: monitor <persona> [tab|group:<n> ...]' }]);
  });

  it('handles "monitor ask <persona> <question>"', () => {
    run('monitor ask bilal how is it going');
    expect(appended).toEqual([]);
  });

  it('reports the error from a failed ask', () => {
    askResult = 'no such monitor';
    run('monitor ask bilal how is it going');
    expect(appended).toEqual([{ input: 'monitor ask bilal how is it going', output: 'no such monitor' }]);
  });

  it('reports the error from a failed start', () => {
    startResult = 'persona not found';
    run('monitor bilal');
    expect(appended).toEqual([{ input: 'monitor bilal', output: 'persona not found' }]);
  });

  it('starts monitoring the current tab when no targets are given', () => {
    run('monitor bilal');
    expect(appended).toEqual([
      { input: 'monitor bilal', output: '→ Now monitoring janus (persona: bilal)' },
    ]);
  });

  it('starts monitoring named tab targets', () => {
    run('monitor bilal wali');
    expect(appended[0].output).toBe('→ Now monitoring wali (persona: bilal)');
  });

  it('starts monitoring group targets', () => {
    run('monitor bilal group:2');
    expect(appended[0].output).toBe('→ Now monitoring group 2 (persona: bilal)');
  });
});

describe('unmonitor command', () => {
  it('has the correct name', () => {
    expect(unmonitor.name).toBe('unmonitor');
  });

  it('matches "unmonitor" case-insensitively, with or without an argument', () => {
    expect(unmonitor.match('unmonitor')).toBe(true);
    expect(unmonitor.match('unmonitor bilal')).toBe(true);
    expect(unmonitor.match('UNMONITOR bilal')).toBe(true);
  });

  it('does not match non-unmonitor input', () => {
    expect(unmonitor.match('monitor bilal')).toBe(false);
  });
});

describe('unmonitor command run', () => {
  let appended: { input: string; output: string }[];
  let tab: { label: string; index: number };
  let managers: unknown;
  let stopAllResult: number;
  let stopResult: boolean;

  beforeEach(() => {
    appended = [];
    tab = { label: 'janus', index: 0 };
    stopAllResult = 0;
    stopResult = false;
    managers = {
      tab: {
        append: (_label: string, entry: { input: string; output: string }) => {
          appended.push(entry);
        },
      },
      monitor: {
        stopAll: (_owner: string) => stopAllResult,
        stop: (_owner: string, _persona: string, _target?: unknown) => stopResult,
      },
    };
  });

  const run = (command_: string) => unmonitor.run(command_, tab, managers as never);

  it('reports a usage error for bare "unmonitor"', () => {
    run('unmonitor');
    expect(appended).toEqual([
      { input: 'unmonitor', output: 'Usage: unmonitor <persona> [tab|group:<n>] | unmonitor --all' },
    ]);
  });

  it('reports when no monitors were stopped with --all', () => {
    run('unmonitor --all');
    expect(appended).toEqual([{ input: 'unmonitor --all', output: 'No monitors running from this tab.' }]);
  });

  it('reports how many monitors were stopped with --all', () => {
    stopAllResult = 2;
    run('unmonitor --all');
    expect(appended).toEqual([{ input: 'unmonitor --all', output: '→ Stopped 2 monitors' }]);
  });

  it('reports singular when exactly one monitor was stopped with --all', () => {
    stopAllResult = 1;
    run('unmonitor --all');
    expect(appended[0].output).toBe('→ Stopped 1 monitor');
  });

  it('reports when a specific persona monitor is stopped', () => {
    stopResult = true;
    run('unmonitor bilal');
    expect(appended).toEqual([{ input: 'unmonitor bilal', output: '→ Stopped bilal monitor' }]);
  });

  it('reports when no matching persona monitor is running', () => {
    run('unmonitor bilal');
    expect(appended).toEqual([{ input: 'unmonitor bilal', output: 'No "bilal" monitor running from this tab.' }]);
  });
});

describe('monitors command', () => {
  it('has the correct name', () => {
    expect(monitors.name).toBe('monitors');
  });

  it('matches "monitors" case-insensitively', () => {
    expect(monitors.match('monitors')).toBe(true);
    expect(monitors.match('MONITORS')).toBe(true);
  });

  it('does not match non-monitors input', () => {
    expect(monitors.match('monitor')).toBe(false);
    expect(monitors.match('monitors bilal')).toBe(false);
  });
});

describe('monitors command run', () => {
  it('reports when there are no active monitors', () => {
    const appended: { input: string; output: string }[] = [];
    const managers = {
      tab: {
        append: (_label: string, entry: { input: string; output: string }) => {
          appended.push(entry);
        },
      },
      monitor: { list: () => [] },
    };
    monitors.run('monitors', { label: 'janus', index: 0 }, managers as never);
    expect(appended).toEqual([{ input: 'monitors', output: 'No active monitors.' }]);
  });

  it('lists active monitors', () => {
    const appended: { input: string; output: string }[] = [];
    const managers = {
      tab: {
        append: (_label: string, entry: { input: string; output: string }) => {
          appended.push(entry);
        },
      },
      monitor: { list: () => ['bilal → janus', 'wali → group 1'] },
    };
    monitors.run('monitors', { label: 'janus', index: 0 }, managers as never);
    expect(appended).toEqual([{ input: 'monitors', output: 'bilal → janus\nwali → group 1' }]);
  });
});
