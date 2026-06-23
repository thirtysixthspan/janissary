import { describe, it, expect } from 'vitest';
import { command } from './connection.js';

describe('connection command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('connection');
  });

  it('matches connection commands', () => {
    expect(command.match('connection close sqlite:mydb')).toBe(true);
    expect(command.match('CONNECTION close sqlite:mydb')).toBe(true);
    expect(command.match('connection list')).toBe(true);
  });

  it('does not match non-connection input', () => {
    expect(command.match('connections')).toBe(false);
    expect(command.match('connect')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});
