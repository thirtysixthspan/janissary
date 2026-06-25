import { describe, it, expect } from 'vitest';
import { parseKind, parseMsgCommand as parseMessageCommand, parseBroadcastCommand } from './messaging.js';

describe('parseKind', () => {
  it('accepts canonical names and aliases', () => {
    expect(parseKind('info')).toBe('info');
    expect(parseKind('i')).toBe('info');
    expect(parseKind('REQUEST')).toBe('request');
    expect(parseKind('req')).toBe('request');
    expect(parseKind('cmd')).toBe('command');
  });

  it('returns null for unknown kinds', () => {
    expect(parseKind('shout')).toBeNull();
  });
});

describe('parseMsgCommand', () => {
  it('parses agent, kind, and text', () => {
    expect(parseMessageCommand('msg bilal info hello there')).toEqual({
      to: 'bilal',
      kind: 'info',
      text: 'hello there',
    });
  });

  it('works without the leading msg keyword and lowercases the recipient', () => {
    expect(parseMessageCommand('Bilal request what is your status')).toEqual({
      to: 'bilal',
      kind: 'request',
      text: 'what is your status',
    });
  });

  it('reports usage when too few arguments', () => {
    expect(parseMessageCommand('msg bilal')).toEqual({ error: expect.stringContaining('Usage') });
  });

  it('reports an unknown message type', () => {
    expect(parseMessageCommand('msg bilal yell hi')).toEqual({ error: expect.stringContaining('Unknown message type') });
  });
});

describe('parseBroadcastCommand', () => {
  it('parses a comma-separated set of recipients', () => {
    expect(parseBroadcastCommand('broadcast bilal,aslan info standby')).toEqual({
      targets: ['bilal', 'aslan'],
      kind: 'info',
      text: 'standby',
    });
  });

  it('treats "all" and "*" as every other agent', () => {
    expect(parseBroadcastCommand('broadcast all command npm test')).toEqual({ targets: 'all', kind: 'command', text: 'npm test' });
    expect(parseBroadcastCommand('broadcast * info go')).toEqual({ targets: 'all', kind: 'info', text: 'go' });
  });

  it('lowercases recipient names', () => {
    const r = parseBroadcastCommand('broadcast Bilal,ASLAN info hi');
    expect(r).toEqual({ targets: ['bilal', 'aslan'], kind: 'info', text: 'hi' });
  });

  it('reports usage and unknown-kind errors', () => {
    expect(parseBroadcastCommand('broadcast all')).toEqual({ error: expect.stringContaining('Usage') });
    expect(parseBroadcastCommand('broadcast all yell hi')).toEqual({ error: expect.stringContaining('Unknown message type') });
  });
});
