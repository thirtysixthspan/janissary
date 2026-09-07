import { describe, it, expect } from 'vitest';
import { availableCommands, getOutput } from './commands.js';

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
