import { describe, it, expect } from 'vitest';
import { getOutput } from './commands.js';

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
});
