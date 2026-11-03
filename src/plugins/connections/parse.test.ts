import { describe, expect, it } from 'vitest';
import { parseConnectionsCommand } from './parse.js';

describe('parseConnectionsCommand', () => {
  it('parses bare, dock, list, and lookup commands', () => {
    expect(parseConnectionsCommand('')).toEqual({ action: 'open-list', centre: true });
    expect(parseConnectionsCommand('', 'connection')).toEqual({ action: 'open-list', centre: true });
    expect(parseConnectionsCommand('LEFT extra')).toEqual({ action: 'dock', side: 'left' });
    expect(parseConnectionsCommand('list extra')).toEqual({ action: 'list' });
    expect(parseConnectionsCommand('sqlite:one', 'connection')).toEqual({ action: 'lookup', text: 'sqlite:one' });
  });

  it.each(['sqlite', 'shell', 'acp', 'browser', 'ssh', 'terminal'])('parses close kind %s case-insensitively', (kind) => {
    expect(parseConnectionsCommand(`CLOSE ${kind.toUpperCase()}:id trailing`))
      .toEqual({ action: 'close', kind, id: 'id' });
  });

  it('preserves the legacy close errors and ignores trailing arguments', () => {
    expect(parseConnectionsCommand('close')).toEqual({ error: 'Usage: connections close <kind>:<id>' });
    expect(parseConnectionsCommand('close invalid')).toEqual({
      error: 'Invalid connection "invalid". Expected <kind>:<id>, e.g. sqlite:mydb.',
    });
    expect(parseConnectionsCommand('close bad:id')).toEqual({
      error: 'Unknown connection kind "bad". Expected one of: sqlite, shell, acp, browser, ssh, terminal.',
    });
    expect(parseConnectionsCommand('close sqlite:')).toEqual({ error: 'Missing id in "sqlite:".' });
  });
});
