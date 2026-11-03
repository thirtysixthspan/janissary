import { describe, it, expect } from 'vitest';
import { dbPath, initDbDir } from './connections.js';
import { parseConnectionCommand } from './connection/parsing.js';

describe('parseConnectionCommand', () => {
  it('parses list', () => {
    expect(parseConnectionCommand('connections list')).toEqual({ action: 'list' });
  });

  it('parses close for each kind', () => {
    expect(parseConnectionCommand('connections close sqlite:mydb')).toEqual({
      action: 'close',
      kind: 'sqlite',
      id: 'mydb',
    });
    expect(parseConnectionCommand('connections close shell:bash')).toEqual({
      action: 'close',
      kind: 'shell',
      id: 'bash',
    });
    expect(parseConnectionCommand('connections close acp:opencode')).toEqual({
      action: 'close',
      kind: 'acp',
      id: 'opencode',
    });
    expect(parseConnectionCommand('connections close browser:w1')).toEqual({
      action: 'close',
      kind: 'browser',
      id: 'w1',
    });
    expect(parseConnectionCommand('connections close ssh:devbox')).toEqual({
      action: 'close',
      kind: 'ssh',
      id: 'devbox',
    });
  });

  it('requires a usage hint when empty', () => {
    expect('error' in parseConnectionCommand('connections')).toBe(true);
  });

  it('names the connections command in its usage messages', () => {
    const bare = parseConnectionCommand('connections');
    const close = parseConnectionCommand('connections close');
    expect('error' in bare && bare.error).toBe('Usage: connections <list|close> [kind:id]  (e.g. connections close sqlite:mydb)');
    expect('error' in close && close.error).toBe('Usage: connections close <kind>:<id>');
  });

  it('rejects a close target without a kind:id form', () => {
    const r = parseConnectionCommand('connections close mydb');
    expect('error' in r && r.error).toContain('<kind>:<id>');
  });

  it('rejects an unknown kind', () => {
    const r = parseConnectionCommand('connections close redis:cache');
    expect('error' in r && r.error).toContain('Unknown connection kind');
    expect('error' in r && r.error).toContain('ssh');
  });

  it('rejects a missing id', () => {
    const r = parseConnectionCommand('connections close sqlite:');
    expect('error' in r && r.error).toContain('Missing id');
  });

  it('rejects a missing close target', () => {
    const r = parseConnectionCommand('connections close');
    expect('error' in r && r.error).toContain('Usage');
  });
});

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
