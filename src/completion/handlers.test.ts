import { describe, it, expect } from 'vitest';
import {
  completeMonitorCommand, completeSearchCommand, completeSyntaxTheme, completeHarnessModel,
} from './handlers.js';
import {
  completeAgentName, completeSendTarget, completeScheduleTarget, completeConnectionClose,
} from './target-handlers.js';
import { readCompletionCursor } from './cursor.js';
import { modelsFor } from '../harness/models.js';

// Every handler reads the same parsed cursor; build it from a whole line with the cursor at its end.
const at = (line: string) => readCompletionCursor(line, line.length);

describe('completeSendTarget', () => {
  it('completes a tab label for the send command at argument 1', () => {
    const r = completeSendTarget(at('send jan'), ['janus', 'claude']);
    expect(r?.newInput).toBe('send janus ');
  });

  it('returns null for a non-send command', () => {
    expect(completeSendTarget(at('msg jan'), ['janus'])).toBeNull();
  });

  it('returns null past the recipient argument', () => {
    expect(completeSendTarget(at('send janus hi'), ['janus'])).toBeNull();
  });

  it('completes a tab label for the queue command at argument 1', () => {
    const r = completeSendTarget(at('queue jan'), ['janus', 'claude']);
    expect(r?.newInput).toBe('queue janus ');
  });

  it('completes a tab label for the close command at argument 1', () => {
    const r = completeSendTarget(at('close jan'), ['janus', 'claude']);
    expect(r?.newInput).toBe('close janus ');
  });

  it('completes a tab label for the exit command at argument 1', () => {
    const r = completeSendTarget(at('exit jan'), ['janus', 'claude']);
    expect(r?.newInput).toBe('exit janus ');
  });
});

describe('completeAgentName', () => {
  it('returns null for a non-msg/broadcast command', () => {
    expect(completeAgentName(at('send jan'), ['janus'])).toBeNull();
  });

  it('returns null past argument 1', () => {
    expect(completeAgentName(at('msg janus hi'), ['janus'])).toBeNull();
  });

  it('completes only the segment after the last comma for broadcast, keeping the typed list', () => {
    const r = completeAgentName(at('broadcast janus,cl'), ['janus', 'claude']);
    expect(r?.newInput).toBe('broadcast janus,claude');
    expect(r?.matches).toEqual(['claude']);
  });
});

describe('completeScheduleTarget', () => {
  it('returns null when the preceding word is not "in"', () => {
    expect(completeScheduleTarget(at('schedule standup every cl'), ['claude'])).toBeNull();
  });

  it('returns null for a non-schedule command', () => {
    expect(completeScheduleTarget(at('msg a in cl'), ['claude'])).toBeNull();
  });

  it('returns null when "in" appears outside the clause slot', () => {
    expect(completeScheduleTarget(at('schedule t every 5m echo in cl'), ['claude'])).toBeNull();
  });
});

describe('completeMonitorCommand', () => {
  // `nightly-bilal` is a monitor a profile named: running, addressable, and not a persona.
  const monitor = {
    personas: ['bilal', 'wali'],
    names: ['bilal', 'nightly-bilal'],
    targets: ['janus', 'group:1'],
  };

  it('returns null when there is no monitor context', () => {
    expect(completeMonitorCommand(at('monitor bi'), undefined)).toBeNull();
  });

  it('returns null for a non-monitor/unmonitor command', () => {
    expect(completeMonitorCommand(at('msg bi'), monitor)).toBeNull();
  });

  it('completes a persona name plus "ask" at argument 1 for monitor', () => {
    const r = completeMonitorCommand(at('monitor '), monitor);
    expect(r?.matches).toEqual(['ask', 'bilal', 'wali']);
  });

  // `unmonitor` and `monitor ask` address a monitor that is already running, so they offer live
  // monitor names rather than personas — otherwise a profile-named monitor cannot be completed at
  // all, and a persona with no monitor running is offered for a command that cannot use it.
  it('completes a live monitor name plus "--all" at argument 1 for unmonitor', () => {
    const r = completeMonitorCommand(at('unmonitor '), monitor);
    expect(r?.matches).toEqual(['--all', 'bilal', 'nightly-bilal']);
  });

  it('completes a live monitor name at argument 2 after "monitor ask"', () => {
    const r = completeMonitorCommand(at('monitor ask ni'), monitor);
    expect(r?.matches).toEqual(['nightly-bilal']);
  });

  it('completes a target at argument 2+ when not in the ask form', () => {
    const r = completeMonitorCommand(at('monitor bilal '), monitor);
    expect(r?.matches).toEqual(['group:1', 'janus']);
  });

  it('returns null at argument 2 for "monitor ask" with no persona typed yet handled elsewhere', () => {
    expect(completeMonitorCommand(at('monitor ask bilal '), monitor)).toBeNull();
  });
});

describe('completeSearchCommand', () => {
  it('completes "transcript" at argument 1', () => {
    const r = completeSearchCommand(at('search tr'));
    expect(r?.newInput).toBe('search transcript ');
  });

  it('returns null for a non-search command', () => {
    expect(completeSearchCommand(at('msg tr'))).toBeNull();
  });

  it('returns null past argument 1', () => {
    expect(completeSearchCommand(at('search transcript x'))).toBeNull();
  });
});

describe('completeSyntaxTheme', () => {
  it('returns null for a non-syntax command', () => {
    expect(completeSyntaxTheme(at('msg th'), ['nord'])).toBeNull();
  });

  it('returns null at argument 2 when the preceding word is not "theme"', () => {
    expect(completeSyntaxTheme(at('syntax bogus no'), ['nord'])).toBeNull();
  });
});

// These exercise the completion mechanics against the real bundled catalog, so both cases derive
// their expectations from it rather than restating it: a fixed prefix that is unambiguous today stops
// being so as soon as a refresh adds a model beside it.
const uniquelyCompleted = modelsFor('claude').find((model) =>
  modelsFor('claude').filter((other) => other.startsWith(model.slice(0, -1))).length === 1,
)!;

describe('completeHarnessModel', () => {
  it('completes a single match for the harness model flag', () => {
    const prefix = uniquelyCompleted.slice(0, -1);
    const r = completeHarnessModel(at(`harness claude --model ${prefix}`));
    expect(r?.newInput).toBe(`harness claude --model ${uniquelyCompleted} `);
  });

  it('completes multiple matches to their longest common prefix', () => {
    const r = completeHarnessModel(at('harness claude --model claude-'));
    // Sorted, because completion offers its matches in that order rather than the catalog's.
    expect(r?.matches).toEqual(
      modelsFor('claude').filter((model) => model.startsWith('claude-')).toSorted((a, b) => a.localeCompare(b)),
    );
    expect(r?.matches.length).toBeGreaterThan(1);
    expect(r?.newInput).toBe('harness claude --model claude-');
  });

  it('returns null for a non-harness command', () => {
    expect(completeHarnessModel(at('msg claude --model claude-op'))).toBeNull();
  });

  it('returns null when the preceding token is not --model', () => {
    expect(completeHarnessModel(at('harness clau'))).toBeNull();
  });

  it('finds no matches for an unknown harness name', () => {
    const r = completeHarnessModel(at('harness bogus --model '));
    expect(r?.matches).toEqual([]);
  });
});

describe('completeConnectionClose', () => {
  it('completes a connection string at argument 2 after "connection close"', () => {
    const r = completeConnectionClose(at('connection close sh'), ['shell:bash']);
    expect(r?.newInput).toBe('connection close shell:bash ');
  });

  it('returns null for "connection list"', () => {
    expect(completeConnectionClose(at('connection list sh'), ['shell:bash'])).toBeNull();
  });

  it('returns null for a non-connection command', () => {
    expect(completeConnectionClose(at('msg close sh'), ['shell:bash'])).toBeNull();
  });
});
