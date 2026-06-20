import { describe, it, expect } from 'vitest';
import { parseKind, parseMsgCommand } from './messaging.js';

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
    expect(parseMsgCommand('msg bilal info hello there')).toEqual({
      to: 'bilal',
      kind: 'info',
      text: 'hello there',
    });
  });

  it('works without the leading msg keyword and lowercases the recipient', () => {
    expect(parseMsgCommand('Bilal request what is your status')).toEqual({
      to: 'bilal',
      kind: 'request',
      text: 'what is your status',
    });
  });

  it('reports usage when too few arguments', () => {
    expect(parseMsgCommand('msg bilal')).toEqual({ error: expect.stringContaining('Usage') });
  });

  it('reports an unknown message type', () => {
    expect(parseMsgCommand('msg bilal yell hi')).toEqual({ error: expect.stringContaining('Unknown message type') });
  });
});
