import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readEffectiveAliases, tokenizeSshConfig } from './parse.js';

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

describe('readEffectiveAliases', () => {
  it('lists only literal names from Host lines', () => {
    expect(readEffectiveAliases(
      'Host web1 web2 db* !blocked\n  HostName a.example\nMatch host ghost\n  HostName ignored',
    )).toEqual([
      { name: 'web1', hostName: 'a.example', user: '', port: '', invalidToken: '' },
      { name: 'web2', hostName: 'a.example', user: '', port: '', invalidToken: '' },
    ]);
  });

  it('applies matching blocks in file order with first values winning', () => {
    expect(readEffectiveAliases([
      'Host web1',
      '  HostName first.example',
      'Host *',
      '  User ops',
      '  Port 2200',
      'Host w?b1',
      '  HostName second.example',
      'Host web1 !web1',
      '  User ignored',
      'Host db*',
      '  User dba',
      'Host !web1',
      '  Port 9999',
      'Host',
      '  HostName no-names',
    ].join('\n'))).toEqual([
      { name: 'web1', hostName: 'first.example', user: 'ops', port: '2200', invalidToken: '' },
    ]);
  });

  it('skips every setting in a Match block, up to the next Host line', () => {
    expect(readEffectiveAliases([
      'Host web1',
      'Match user ops',
      '  HostName match.example',
      '  User matchuser',
      '  Port 4242',
      'Host web2',
    ].join('\n'))).toEqual([
      { name: 'web1', hostName: '', user: '', port: '', invalidToken: '' },
      { name: 'web2', hostName: '', user: '', port: '', invalidToken: '' },
    ]);
  });

  it('expands %h and %% in HostName and marks any other % token invalid', () => {
    const record = (config: string) => readEffectiveAliases(config)[0];
    expect(record('Host web1\n  HostName %h.%%.example')).toEqual({
      name: 'web1', hostName: 'web1.%.example', user: '', port: '', invalidToken: '',
    });
    expect(record('Host web1\n  HostName %n.example')).toEqual({
      name: 'web1', hostName: '%n.example', user: '', port: '', invalidToken: '%n',
    });
    expect(record('Host web1\n  HostName trailing%')).toEqual({
      name: 'web1', hostName: 'trailing%', user: '', port: '', invalidToken: '%',
    });
    expect(record('Host web1\n  HostName %p')).toEqual({
      name: 'web1', hostName: '%p', user: '', port: '', invalidToken: '%p',
    });
    expect(record('Host web1\n  User %h')).toEqual({
      name: 'web1', hostName: '', user: '%h', port: '', invalidToken: '%h',
    });
    expect(record('Host web1\n  Port %%')).toEqual({
      name: 'web1', hostName: '', user: '', port: '%%', invalidToken: '%%',
    });
  });

  it('folds names by case, keeps the first spelling, and retains invalid records', () => {
    expect(readEffectiveAliases([
      'Host Web1',
      'Host web1',
      '  User ops',
      'Host bad',
      '  HostName %n',
    ].join('\n'))).toEqual([
      { name: 'Web1', hostName: '', user: 'ops', port: '', invalidToken: '' },
      { name: 'bad', hostName: '%n', user: '', port: '', invalidToken: '%n' },
    ]);
  });

  it('keeps imports inside ./ or package specifiers with .js extensions', () => {
    for (const file of ['./parse.ts', './parse.test.ts']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      for (const entry of source.matchAll(/^import .* from '([^']+)';/gm)) {
        const specifier = entry[1] ?? '';
        expect(specifier).not.toContain('../');
        if (specifier.startsWith('.')) expect(specifier).toMatch(/\.js$/);
      }
    }
  });
});
