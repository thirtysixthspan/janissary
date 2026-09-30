import { describe, expect, it } from 'vitest';
import { logOutcome } from './console-result';

describe('logOutcome', () => {
  it('says the failure, which is the only thing a user who ran it needs to read', () => {
    expect(logOutcome({ sql: 'UPDATE nope', changed: 0, error: 'no such table: nope' }))
      .toBe('no such table: nope');
  });

  it('says nothing changed for a statement that changed nothing', () => {
    expect(logOutcome({ sql: 'CREATE TABLE t (a)', changed: 0 })).toBe('OK.');
  });

  it('counts the rows one row at a time when there is only one', () => {
    expect(logOutcome({ sql: 'DELETE FROM logs', changed: 1 })).toBe('1 row changed.');
    expect(logOutcome({ sql: 'UPDATE t', changed: 2 })).toBe('2 rows changed.');
  });
});
