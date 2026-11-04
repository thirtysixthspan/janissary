import { describe, expect, it } from 'vitest';
import { parseConnectionsCommand } from './parse.js';

describe('parseConnectionsCommand', () => {
  it('parses bare, dock, list, and lookup commands', () => {
    expect(parseConnectionsCommand('')).toEqual({ action: 'open-list', centre: true });
    expect(parseConnectionsCommand('   \t  ')).toEqual({ action: 'open-list', centre: true });
    expect(parseConnectionsCommand('', 'connection')).toEqual({ action: 'open-list', centre: true });
    expect(parseConnectionsCommand('LEFT extra')).toEqual({ action: 'dock', side: 'left' });
    expect(parseConnectionsCommand('RIGHT extra')).toEqual({ action: 'dock', side: 'right' });
    expect(parseConnectionsCommand('list extra')).toEqual({ action: 'list' });
    expect(parseConnectionsCommand('sqlite:one', 'connection')).toEqual({ action: 'lookup', text: 'sqlite:one' });
  });

  it.each(['connections', 'connection'] as const)('returns the complete multiword lookup text for %s', (name) => {
    expect(parseConnectionsCommand('  ACP: explain this test  ', name))
      .toEqual({ action: 'lookup', text: 'ACP: explain this test' });
    expect(parseConnectionsCommand('acp: Explain This Test', name))
      .toEqual({ action: 'lookup', text: 'acp: Explain This Test' });
    expect(parseConnectionsCommand('ACP: explain  this test', name))
      .toEqual({ action: 'lookup', text: 'ACP: explain  this test' });
    expect(parseConnectionsCommand('ACP:\texplain  this test', name))
      .toEqual({ action: 'lookup', text: 'ACP:\texplain  this test' });
    expect(parseConnectionsCommand('no such generated title', name))
      .toEqual({ action: 'lookup', text: 'no such generated title' });
  });

  it('keeps singular docking words as lookup text while plural commands dock', () => {
    for (const text of ['left extra', 'right extra']) {
      expect(parseConnectionsCommand(text, 'connection')).toEqual({ action: 'lookup', text });
    }
    expect(parseConnectionsCommand('LEFT extra', 'connections')).toEqual({ action: 'dock', side: 'left' });
    expect(parseConnectionsCommand('RIGHT extra', 'connections')).toEqual({ action: 'dock', side: 'right' });
  });

  it.each(['sqlite', 'shell', 'acp', 'browser', 'ssh', 'terminal'])('parses close kind %s case-insensitively', (kind) => {
    expect(parseConnectionsCommand(`CLOSE ${kind.toUpperCase()}:id trailing`))
      .toEqual({ action: 'close', kind, id: 'id' });
  });

  it('keeps first-colon id punctuation and ignores trailing arguments', () => {
    expect(parseConnectionsCommand('close sqlite:a:b trailing'))
      .toEqual({ action: 'close', kind: 'sqlite', id: 'a:b' });
    expect(parseConnectionsCommand('close acp:provider/model'))
      .toEqual({ action: 'close', kind: 'acp', id: 'provider/model' });
    expect(parseConnectionsCommand('close ssh:host:port'))
      .toEqual({ action: 'close', kind: 'ssh', id: 'host:port' });
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
    expect(parseConnectionsCommand('close sqlite')).toEqual({
      error: 'Invalid connection "sqlite". Expected <kind>:<id>, e.g. sqlite:mydb.',
    });
  });
});
