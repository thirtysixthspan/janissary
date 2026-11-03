import { describe, it, expect } from 'vitest';
import { dbPath, initDbDir } from './connections.js';

describe('dbPath', () => {
  it('constructs a valid path for a well-formed name', () => {
    initDbDir('/base');
    expect(dbPath('mydb')).toContain('mydb.sqlite');
    expect(dbPath('my-db_1')).toContain('my-db_1.sqlite');
  });

  it('rejects traversal names', () => {
    initDbDir('/base');
    expect(() => dbPath('../../etc/shadow')).toThrow();
    expect(() => dbPath('../sibling')).toThrow();
    expect(() => dbPath('db/sub')).toThrow();
  });
});
