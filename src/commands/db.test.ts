import { describe, it, expect } from 'vitest';
import { command } from './db.js';

describe('db command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('db');
  });

  it('matches db commands', () => {
    expect(command.match('db sqlite query mydb SELECT 1')).toBe(true);
    expect(command.match('DB sqlite query mydb SELECT 1')).toBe(true);
    expect(command.match('db')).toBe(true);
  });

  it('does not match non-db input', () => {
    expect(command.match('dbs')).toBe(false);
    expect(command.match('db_extra')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});
