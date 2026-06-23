import { describe, it, expect } from 'vitest';
import { dbRecognizer } from './db.js';

const noDb = { openDbs: [] as string[] };
const oneDb = { openDbs: ['movies'] };

describe('dbRecognizer', () => {
  it('matches a SQL query when a db connection is open', () => {
    const r = dbRecognizer.recognize('SELECT * FROM actors', oneDb);
    expect(r.match).toBe(true);
    expect(r.reliability).toBeGreaterThan(0.8);
  });

  it('never matches when no db connection is open in the tab', () => {
    expect(dbRecognizer.recognize('SELECT * FROM actors', noDb).match).toBe(false);
  });

  it('is case-insensitive on the leading keyword', () => {
    expect(dbRecognizer.recognize('select id from t where x = 1', oneDb).match).toBe(true);
  });

  it('does not match a shell command', () => {
    expect(dbRecognizer.recognize('ls -la', oneDb).match).toBe(false);
  });
});
