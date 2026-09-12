import { describe, it, expect } from 'vitest';
import { availableCommands, getOutput } from './commands.js';
import { commands } from './commands/index.js';
import { findPriorityConflicts } from './commands/priority.js';

function helpText(): string {
  const result = getOutput('help');
  if (result.kind !== 'output') throw new Error('help did not classify as output');
  return result.text;
}

describe('availableCommands', () => {
  it('exposes conversations without the former chat command', () => {
    expect(availableCommands).toContain('conversations');
    expect(availableCommands).not.toContain('chat');
  });

  // Derived from the registry now. The hand-written list it replaced omitted these outright, which
  // is the drift that made a second list worth deleting rather than correcting.
  it.each([['open'], ['edit'], ['queue'], ['rename'], ['profile'], ['monitor'], ['theme']])(
    'includes %s, which the hand-written list omitted',
    (name) => { expect(availableCommands).toContain(name); },
  );

  it('still carries the one built-in that has no registry entry', () => {
    expect(availableCommands).toContain('help');
  });
});

// The registry's order is its dispatch priority. Each command declares the inputs it owns, and this
// replays `resolveCommand`'s first-fit walk over them: a command appended to the list whose `match`
// also accepts an earlier entry's input — or whose own input an earlier entry already claims —
// fails here rather than misrouting every session.
describe('command registry priority', () => {
  it('routes every declared sample to the command that declares it', () => {
    expect(findPriorityConflicts(commands)).toEqual([]);
  });

  it('has every registered command declare at least one sample', () => {
    expect(commands.filter((command) => command.samples.length === 0).map((c) => c.name)).toEqual([]);
  });
});

describe('getOutput("help")', () => {
  it('documents the queue command', () => {
    expect(helpText()).toContain('`queue`');
    expect(helpText()).toContain('queue <agent> <command>');
  });

  it('documents the Ctrl+E queue-picker key binding', () => {
    expect(helpText()).toContain('Ctrl+E');
  });

  it('documents the Ctrl+G tab-navigator key binding', () => {
    expect(helpText()).toContain('Ctrl+G');
  });
});
