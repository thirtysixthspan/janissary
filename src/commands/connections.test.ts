import { describe, it, expect } from 'vitest';
import { command } from './connections.js';

describe('connections command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('connections');
  });

  it('matches connections commands', () => {
    expect(command.match('connections close sqlite:mydb')).toBe(true);
    expect(command.match('CONNECTIONS close sqlite:mydb')).toBe(true);
    expect(command.match('connections list')).toBe(true);
  });

  it('does not match non-connections input', () => {
    expect(command.match('connection list')).toBe(false);
    expect(command.match('connection')).toBe(false);
    expect(command.match('connect')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});
