import { describe, it, expect } from 'vitest';
import { command } from './acp.js';

describe('acp command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('acp');
  });

  it('matches acp commands', () => {
    expect(command.match('acp summarize this repo')).toBe(true);
    expect(command.match('ACP summarize this repo')).toBe(true);
    expect(command.match('acp')).toBe(true);
  });

  it('does not match non-acp input', () => {
    expect(command.match('acp-extra')).toBe(true); // \b matches before '-'
    expect(command.match('acp  ')).toBe(true);
    expect(command.match('clear')).toBe(false);
  });
});
