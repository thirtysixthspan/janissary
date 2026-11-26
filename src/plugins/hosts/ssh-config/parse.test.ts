import { describe, expect, it } from 'vitest';
import { tokenizeSshConfig } from './parse.js';

describe('tokenizeSshConfig', () => {
  it('consumes Include lines without affecting the blocks around them', () => {
    expect(tokenizeSshConfig('Include other\nHost web1\n  HostName a\n')).toEqual([
      { kind: 'host', names: ['web1'], settings: [{ keyword: 'hostname', value: 'a' }] },
    ]);
    expect(tokenizeSshConfig('Host one\nInclude other\nHost two\n  HostName b')).toEqual([
      { kind: 'host', names: ['one'], settings: [{ keyword: 'include', value: 'other' }] },
      { kind: 'host', names: ['two'], settings: [{ keyword: 'hostname', value: 'b' }] },
    ]);
  });

  it('matches keywords without regard to case', () => {
    const lower = tokenizeSshConfig('host web1\nhostname a');
    expect(tokenizeSshConfig('HOST web1\nHOSTNAME a')).toEqual(lower);
    expect(tokenizeSshConfig('HoSt web1\nHostName a')).toEqual(lower);
    expect(lower).toEqual([
      { kind: 'host', names: ['web1'], settings: [{ keyword: 'hostname', value: 'a' }] },
    ]);
  });

  it('accepts = and whitespace separators, keeping later = in the argument', () => {
    const spaced = tokenizeSshConfig('Host web1 web2\nHostName host.example');
    expect(tokenizeSshConfig('Host=web1 web2\nHostName=host.example')).toEqual(spaced);
    expect(spaced).toEqual([
      {
        kind: 'host',
        names: ['web1', 'web2'],
        settings: [{ keyword: 'hostname', value: 'host.example' }],
      },
    ]);
    expect(tokenizeSshConfig('Host web1\nHostName a=b=c')).toEqual([
      { kind: 'host', names: ['web1'], settings: [{ keyword: 'hostname', value: 'a=b=c' }] },
    ]);
  });

  it('keeps spaces inside double-quoted arguments', () => {
    expect(tokenizeSshConfig('Host "web one" web2')).toEqual([
      { kind: 'host', names: ['web one', 'web2'], settings: [] },
    ]);
    expect(tokenizeSshConfig('Host web1\n  HostName "a b#c"')).toEqual([
      { kind: 'host', names: ['web1'], settings: [{ keyword: 'hostname', value: 'a b#c' }] },
    ]);
  });

  it('truncates a line at a # outside quotes', () => {
    expect(tokenizeSshConfig('Host web1 # note\n  HostName a')).toEqual([
      { kind: 'host', names: ['web1'], settings: [{ keyword: 'hostname', value: 'a' }] },
    ]);
  });

  it('yields the rest of the line as one argument for an unterminated quote', () => {
    expect(tokenizeSshConfig('Host "web one')).toEqual([
      { kind: 'host', names: ['web one'], settings: [] },
    ]);
  });

  it('treats single quotes as ordinary characters', () => {
    expect(tokenizeSshConfig("Host 'web one'")).toEqual([
      { kind: 'host', names: ["'web", "one'"], settings: [] },
    ]);
  });

  it('does not continue a line after a trailing backslash', () => {
    expect(tokenizeSshConfig('Host web1\\\n  Port 22')).toEqual([
      { kind: 'host', names: ['web1\\'], settings: [{ keyword: 'port', value: '22' }] },
    ]);
  });

  it('produces one Host block carrying every name in file order, repeats included', () => {
    expect(tokenizeSshConfig('Host web1 web2 web1\nMaTcH user ops')).toEqual([
      { kind: 'host', names: ['web1', 'web2', 'web1'], settings: [] },
      { kind: 'match', criteria: ['user', 'ops'], settings: [] },
    ]);
  });

  it('marks Match blocks so their settings can be skipped later', () => {
    expect(tokenizeSshConfig('Host web1\nMatch user ops\n  HostName ignored\nHost web2')).toEqual([
      { kind: 'host', names: ['web1'], settings: [] },
      {
        kind: 'match',
        criteria: ['user', 'ops'],
        settings: [{ keyword: 'hostname', value: 'ignored' }],
      },
      { kind: 'host', names: ['web2'], settings: [] },
    ]);
  });

  it('produces empty names or criteria for a block line with no arguments', () => {
    expect(tokenizeSshConfig('Host\nMatch\nHost x')).toEqual([
      { kind: 'host', names: [], settings: [] },
      { kind: 'match', criteria: [], settings: [] },
      { kind: 'host', names: ['x'], settings: [] },
    ]);
  });

  it('does not let an unrecognized keyword absorb the next line', () => {
    expect(tokenizeSshConfig('UnknownThing foo\nHostName orphan\nHost one\n  HostName a')).toEqual([
      { kind: 'host', names: ['one'], settings: [{ keyword: 'hostname', value: 'a' }] },
    ]);
  });

  it('attaches settings to the current block until the next block line', () => {
    expect(tokenizeSshConfig('HostName orphan\nHost one\n  Port 22\n  IdentityFile key\nHost two')).toEqual([
      {
        kind: 'host',
        names: ['one'],
        settings: [
          { keyword: 'port', value: '22' },
          { keyword: 'identityfile', value: 'key' },
        ],
      },
      { kind: 'host', names: ['two'], settings: [] },
    ]);
  });

  it('returns no blocks for empty, comment-only, or block-free text', () => {
    expect(tokenizeSshConfig('')).toEqual([]);
    expect(tokenizeSshConfig('# nothing\n   \n\t\n  # indented')).toEqual([]);
    expect(tokenizeSshConfig('HostName a\nPort 22\nInclude other')).toEqual([]);
  });

  it('tokenizes the verification config into two ordered blocks', () => {
    expect(tokenizeSshConfig(
      'Include other\nHost web1 web2\n  HostName %h.corp.example\nMatch user ops\n# note',
    )).toEqual([
      {
        kind: 'host',
        names: ['web1', 'web2'],
        settings: [{ keyword: 'hostname', value: '%h.corp.example' }],
      },
      { kind: 'match', criteria: ['user', 'ops'], settings: [] },
    ]);
  });
});
