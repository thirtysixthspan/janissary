import { describe, it, expect } from 'vitest';
import { availableCommands, getOutput } from './commands.js';

describe('availableCommands', () => {
  it('exposes conversations without the former chat command', () => {
    expect(availableCommands).toContain('conversations');
    expect(availableCommands).not.toContain('chat');
  });
});

describe('getOutput("help")', () => {
  it('documents the queue command', () => {
    const help = getOutput('help');
    expect(help).toContain('`queue`');
    expect(help).toContain('queue <agent> <command>');
  });

  it('documents the Ctrl+E queue-picker key binding', () => {
    const help = getOutput('help');
    expect(help).toContain('Ctrl+E');
  });

  it('documents the Ctrl+G tab-navigator key binding', () => {
    const help = getOutput('help');
    expect(help).toContain('Ctrl+G');
  });
});
