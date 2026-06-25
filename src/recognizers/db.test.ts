import { describe, it, expect } from 'vitest';
import { dbRecognizer as databaseRecognizer } from './db.js';

const noDatabase = { openDbs: [] as string[] };
const oneDatabase = { openDbs: ['movies'] };

describe('dbRecognizer', () => {
  it('matches a SQL query when a db connection is open', () => {
    const r = databaseRecognizer.recognize('SELECT * FROM actors', oneDatabase);
    expect(r.match).toBe(true);
    expect(r.reliability).toBeGreaterThan(0.8);
  });

  it('never matches when no db connection is open in the tab', () => {
    expect(databaseRecognizer.recognize('SELECT * FROM actors', noDatabase).match).toBe(false);
  });

  it('is case-insensitive on the leading keyword', () => {
    expect(databaseRecognizer.recognize('select id from t where x = 1', oneDatabase).match).toBe(true);
  });

  it('does not match a shell command', () => {
    expect(databaseRecognizer.recognize('ls -la', oneDatabase).match).toBe(false);
  });
});
