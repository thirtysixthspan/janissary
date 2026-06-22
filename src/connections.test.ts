import { describe, it, expect } from 'vitest';
import { parseConnectionCommand } from './connections.js';

describe('parseConnectionCommand', () => {
  it('parses list', () => {
    expect(parseConnectionCommand('connection list')).toEqual({ action: 'list' });
  });

  it('parses close for each kind', () => {
    expect(parseConnectionCommand('connection close sqlite:mydb')).toEqual({
      action: 'close',
      kind: 'sqlite',
      id: 'mydb',
    });
    expect(parseConnectionCommand('connection close shell:bash')).toEqual({
      action: 'close',
      kind: 'shell',
      id: 'bash',
    });
    expect(parseConnectionCommand('connection close acp:opencode')).toEqual({
      action: 'close',
      kind: 'acp',
      id: 'opencode',
    });
  });

  it('requires a usage hint when empty', () => {
    expect('error' in parseConnectionCommand('connection')).toBe(true);
  });

  it('rejects a close target without a kind:id form', () => {
    const r = parseConnectionCommand('connection close mydb');
    expect('error' in r && r.error).toContain('<kind>:<id>');
  });

  it('rejects an unknown kind', () => {
    const r = parseConnectionCommand('connection close redis:cache');
    expect('error' in r && r.error).toContain('Unknown connection kind');
  });

  it('rejects a missing id', () => {
    const r = parseConnectionCommand('connection close sqlite:');
    expect('error' in r && r.error).toContain('Missing id');
  });

  it('rejects a missing close target', () => {
    const r = parseConnectionCommand('connection close');
    expect('error' in r && r.error).toContain('Usage');
  });
});
