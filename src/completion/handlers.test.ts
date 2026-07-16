import { describe, it, expect } from 'vitest';
import {
  completeAgentName,
  completeSendTarget,
  completeScheduleTarget,
  completeMonitorCommand,
  completeSearchCommand,
  completeSyntaxTheme,
  completeConnectionClose,
  completeHarnessModel,
} from './handlers.js';

describe('completeSendTarget', () => {
  it('completes a tab label for the send command at argument 1', () => {
    const r = completeSendTarget('send', 1, 'jan', ['janus', 'claude'], 'send jan', '', 5);
    expect(r?.newInput).toBe('send janus ');
  });

  it('returns null for a non-send command', () => {
    expect(completeSendTarget('msg', 1, 'jan', ['janus'], 'msg jan', 'msg jan', 4)).toBeNull();
  });

  it('returns null past the recipient argument', () => {
    expect(completeSendTarget('send', 2, 'hi', ['janus'], 'send janus hi', 'send janus hi', 11)).toBeNull();
  });

  it('completes a tab label for the queue command at argument 1', () => {
    const r = completeSendTarget('queue', 1, 'jan', ['janus', 'claude'], 'queue jan', '', 6);
    expect(r?.newInput).toBe('queue janus ');
  });

  it('completes a tab label for the close command at argument 1', () => {
    const r = completeSendTarget('close', 1, 'jan', ['janus', 'claude'], 'close jan', '', 6);
    expect(r?.newInput).toBe('close janus ');
  });

  it('completes a tab label for the exit command at argument 1', () => {
    const r = completeSendTarget('exit', 1, 'jan', ['janus', 'claude'], 'exit jan', '', 5);
    expect(r?.newInput).toBe('exit janus ');
  });
});

describe('completeAgentName', () => {
  it('returns null for a non-msg/broadcast command', () => {
    expect(completeAgentName('send', 1, 'jan', ['janus'], 'send jan', 'send jan', 5)).toBeNull();
  });

  it('returns null past argument 1', () => {
    expect(completeAgentName('msg', 2, 'hi', ['janus'], 'msg janus hi', 'msg janus hi', 10)).toBeNull();
  });
});

describe('completeScheduleTarget', () => {
  it('returns null when the preceding word is not "in"', () => {
    expect(
      completeScheduleTarget('schedule', 3, ['schedule', 'standup', 'every'], 'cl', ['claude'], '', '', 0),
    ).toBeNull();
  });

  it('returns null for a non-schedule command', () => {
    expect(
      completeScheduleTarget('msg', 3, ['msg', 'a', 'in'], 'cl', ['claude'], '', '', 0),
    ).toBeNull();
  });

  it('returns null when "in" appears outside the clause slot', () => {
    expect(
      completeScheduleTarget('schedule', 6, ['schedule', 't', 'every', '5m', 'echo', 'in'], 'cl', ['claude'], '', '', 0),
    ).toBeNull();
  });
});

describe('completeMonitorCommand', () => {
  const monitor = { personas: ['bilal', 'wali'], targets: ['janus', 'group:1'] };

  it('returns null when there is no monitor context', () => {
    expect(completeMonitorCommand('monitor', 1, ['monitor'], 'bi', undefined, '', '', 0)).toBeNull();
  });

  it('returns null for a non-monitor/unmonitor command', () => {
    expect(completeMonitorCommand('msg', 1, ['msg'], 'bi', monitor, '', '', 0)).toBeNull();
  });

  it('completes a persona name plus "ask" at argument 1 for monitor', () => {
    const r = completeMonitorCommand('monitor', 1, ['monitor'], '', monitor, 'monitor ', 'monitor ', 8);
    expect(r?.matches).toEqual(['ask', 'bilal', 'wali']);
  });

  it('completes a persona name plus "--all" at argument 1 for unmonitor', () => {
    const r = completeMonitorCommand('unmonitor', 1, ['unmonitor'], '', monitor, 'unmonitor ', 'unmonitor ', 10);
    expect(r?.matches).toEqual(['--all', 'bilal', 'wali']);
  });

  it('completes a persona name at argument 2 after "monitor ask"', () => {
    const r = completeMonitorCommand('monitor', 2, ['monitor', 'ask'], 'bi', monitor, 'monitor ask bi', 'monitor ask bi', 12);
    expect(r?.matches).toEqual(['bilal']);
  });

  it('completes a target at argument 2+ when not in the ask form', () => {
    const r = completeMonitorCommand('monitor', 2, ['monitor', 'bilal'], '', monitor, 'monitor bilal ', 'monitor bilal ', 13);
    expect(r?.matches).toEqual(['group:1', 'janus']);
  });

  it('returns null at argument 2 for "monitor ask" with no persona typed yet handled elsewhere', () => {
    expect(
      completeMonitorCommand('monitor', 3, ['monitor', 'ask', 'bilal'], '', monitor, '', '', 0),
    ).toBeNull();
  });
});

describe('completeSearchCommand', () => {
  it('completes "transcript" at argument 1', () => {
    const r = completeSearchCommand('search', 1, 'tr', 'search tr', '', 7);
    expect(r?.newInput).toBe('search transcript ');
  });

  it('returns null for a non-search command', () => {
    expect(completeSearchCommand('msg', 1, 'tr', 'msg tr', 'msg tr', 4)).toBeNull();
  });

  it('returns null past argument 1', () => {
    expect(completeSearchCommand('search', 2, 'x', 'search transcript x', 'search transcript x', 18)).toBeNull();
  });
});

describe('completeSyntaxTheme', () => {
  it('returns null for a non-syntax command', () => {
    expect(completeSyntaxTheme('msg', 1, ['msg'], 'th', ['nord'], '', '', 0)).toBeNull();
  });

  it('returns null at argument 2 when the preceding word is not "theme"', () => {
    expect(completeSyntaxTheme('syntax', 2, ['syntax', 'bogus'], 'no', ['nord'], '', '', 0)).toBeNull();
  });
});

describe('completeHarnessModel', () => {
  it('completes a single match for the harness model flag', () => {
    const r = completeHarnessModel(
      'harness', ['harness', 'claude', '--model'], 'claude-op', 'harness claude --model claude-op', '', 23,
    );
    expect(r?.newInput).toBe('harness claude --model claude-opus-4-8 ');
  });

  it('completes multiple matches to their longest common prefix', () => {
    const r = completeHarnessModel(
      'harness', ['harness', 'claude', '--model'], 'claude-', 'harness claude --model claude-', '', 23,
    );
    expect(r?.matches).toEqual(['claude-fable-5', 'claude-haiku-4-5-20251001', 'claude-opus-4-8', 'claude-sonnet-5']);
  });

  it('returns null for a non-harness command', () => {
    expect(
      completeHarnessModel('msg', ['msg', 'claude', '--model'], 'claude-op', 'msg claude --model claude-op', '', 20),
    ).toBeNull();
  });

  it('returns null when the preceding token is not --model', () => {
    expect(
      completeHarnessModel('harness', ['harness', 'claude'], 'clau', 'harness clau', 'harness clau', 8),
    ).toBeNull();
  });

  it('finds no matches for an unknown harness name', () => {
    const r = completeHarnessModel('harness', ['harness', 'bogus', '--model'], '', 'harness bogus --model ', '', 22);
    expect(r?.matches).toEqual([]);
  });
});

describe('completeConnectionClose', () => {
  it('completes a connection string at argument 2 after "connection close"', () => {
    const r = completeConnectionClose(
      'connection', 2, ['connection', 'close'], 'sh', ['shell:bash'], 'connection close sh', '', 17,
    );
    expect(r?.newInput).toBe('connection close shell:bash ');
  });

  it('returns null for "connection list"', () => {
    expect(
      completeConnectionClose('connection', 2, ['connection', 'list'], 'sh', ['shell:bash'], '', '', 0),
    ).toBeNull();
  });

  it('returns null for a non-connection command', () => {
    expect(completeConnectionClose('msg', 2, ['msg', 'close'], 'sh', ['shell:bash'], '', '', 0)).toBeNull();
  });
});
