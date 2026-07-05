import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { completeCommandLine } from './completion.js';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'compl-'));
  writeFileSync(path.join(dir, 'report.txt'), '');
  writeFileSync(path.join(dir, 'unique.log'), '');
  writeFileSync(path.join(dir, 'data1.csv'), '');
  writeFileSync(path.join(dir, 'data2.csv'), '');
  writeFileSync(path.join(dir, '.hidden'), '');
  mkdirSync(path.join(dir, 'srcdir'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('completeCommandLine', () => {
  it('completes a unique file and appends a space', () => {
    const r = completeCommandLine('cat uni', 7, dir);
    expect(r.newInput).toBe('cat unique.log ');
    expect(r.newCursor).toBe(r.newInput.length);
  });

  it('appends a trailing slash for a unique directory match', () => {
    const r = completeCommandLine('ls src', 6, dir);
    expect(r.newInput).toBe('ls srcdir/');
  });

  it('extends to the longest common prefix for multiple matches', () => {
    const r = completeCommandLine('cat da', 6, dir);
    expect(r.newInput).toBe('cat data'); // data1.csv / data2.csv share the prefix "data"
    expect(r.matches.toSorted((a, b) => a.localeCompare(b))).toEqual(['data1.csv', 'data2.csv']);
  });

  it('reports all matches when no further completion is possible', () => {
    const r = completeCommandLine('cat data', 8, dir);
    expect(r.newInput).toBe('cat data');
    expect(r.matches.toSorted((a, b) => a.localeCompare(b))).toEqual(['data1.csv', 'data2.csv']);
  });

  it('completes a unique deeper match fully', () => {
    const r = completeCommandLine('cat rep', 7, dir);
    expect(r.newInput).toBe('cat report.txt ');
  });

  it('hides dotfiles unless the token starts with a dot', () => {
    expect(completeCommandLine('cat ', 4, dir).matches).not.toContain('.hidden');
    expect(completeCommandLine('cat .', 5, dir).matches).toContain('.hidden');
  });

  it('completes the token at the cursor, not the end of the line', () => {
    const r = completeCommandLine('cat uni file', 7, dir);
    expect(r.newInput).toBe('cat unique.log  file');
    expect(r.newCursor).toBe('cat unique.log '.length);
  });

  it('returns no matches for an unknown prefix', () => {
    const r = completeCommandLine('cat zzz', 7, dir);
    expect(r.matches).toEqual([]);
    expect(r.newInput).toBe('cat zzz');
  });
});

describe('completeCommandLine — agent names', () => {
  const agents = ['janus', 'bilal', 'aslan'];
  const noFiles = '/no/such/dir/xyz'; // file fallback is a no-op here

  it('completes a unique agent recipient for msg and adds a space', () => {
    expect(completeCommandLine('msg bi', 6, noFiles, agents).newInput).toBe('msg bilal ');
  });

  it('fills the common prefix when several agents match', () => {
    expect(completeCommandLine('msg a', 5, noFiles, agents).newInput).toBe('msg aslan '); // only aslan starts with "a"
    const r = completeCommandLine('msg ', 4, noFiles, ['ahmed', 'aslan']);
    expect(r.newInput).toBe('msg a'); // ahmed/aslan -> common prefix "a"
    expect(r.matches.toSorted((a, b) => a.localeCompare(b))).toEqual(['ahmed', 'aslan']);
  });

  it('offers "all" and supports comma lists for broadcast', () => {
    expect(completeCommandLine('broadcast al', 12, noFiles, agents).newInput).toBe('broadcast all');
    // complete the segment after the last comma, preserving what was typed
    expect(completeCommandLine('broadcast bilal,as', 18, noFiles, agents).newInput).toBe('broadcast bilal,aslan');
  });

  it('does not complete agents past the recipient position', () => {
    // the message text position is not an agent slot, so no agent name is filled in
    expect(completeCommandLine('msg bilal jan', 13, noFiles, agents).newInput).toBe('msg bilal jan');
  });
});

describe('completeCommandLine — schedule `in <tab>` target', () => {
  const labels = ['janus', 'claude', 'worker'];
  const noFiles = '/no/such/dir/xyz';

  it('completes the tab label after `in` for add, list/clear, and cancel forms', () => {
    expect(completeCommandLine('schedule standup in cl', 22, noFiles, labels).newInput).toBe('schedule standup in claude ');
    expect(completeCommandLine('schedule list in wo', 19, noFiles, labels).newInput).toBe('schedule list in worker ');
    expect(completeCommandLine('schedule cancel standup in cl', 29, noFiles, labels).newInput).toBe('schedule cancel standup in claude ');
  });

  it('does not treat `in` inside the scheduled command as a target slot', () => {
    const r = completeCommandLine('schedule t every 5m echo built in cl', 36, noFiles, labels);
    expect(r.newInput).toBe('schedule t every 5m echo built in cl');
  });
});

describe('completeCommandLine — connection strings', () => {
  const noFiles = '/no/such/dir/xyz';
  const conns = ['shell:bash', 'acp:opencode', 'sqlite:movies', 'sqlite:shop'];

  it('completes a unique connection string and adds a space', () => {
    expect(completeCommandLine('connection close acp', 20, noFiles, [], conns).newInput).toBe(
      'connection close acp:opencode ',
    );
  });

  it('fills the common prefix when several connections match', () => {
    const r = completeCommandLine('connection close sq', 19, noFiles, [], conns);
    expect(r.newInput).toBe('connection close sqlite:');
    expect(r.matches.toSorted((a, b) => a.localeCompare(b))).toEqual(['sqlite:movies', 'sqlite:shop']);
  });

  it('offers every open connection for an empty target', () => {
    const r = completeCommandLine('connection close ', 17, noFiles, [], conns);
    expect(r.matches.toSorted((a, b) => a.localeCompare(b))).toEqual(['acp:opencode', 'shell:bash', 'sqlite:movies', 'sqlite:shop']);
  });

  it('does not offer connections for `connection list` or the command word', () => {
    expect(completeCommandLine('connection lis', 14, noFiles, [], conns).matches).toEqual([]);
    expect(completeCommandLine('connection close ', 17, noFiles, [], []).matches).toEqual([]);
  });
});

describe('completeCommandLine — browser command', () => {
  const noFiles = '/no/such/dir/xyz';
  const conns = ['shell:bash', 'browser:w1', 'browser:w2', 'sqlite:movies'];

  it('completes a unique subcommand and adds a space', () => {
    expect(completeCommandLine('browser co', 10, noFiles, [], conns).newInput).toBe('browser content ');
  });

  it('fills the common prefix when several subcommands match', () => {
    const r = completeCommandLine('browser c', 9, noFiles, [], conns);
    expect(r.newInput).toBe('browser c'); // close/content -> common prefix "c"
    expect(r.matches.toSorted((a, b) => a.localeCompare(b))).toEqual(['close', 'content']);
  });

  it('offers every subcommand for an empty argument', () => {
    const r = completeCommandLine('browser ', 8, noFiles, [], conns);
    expect(r.matches).toContain('goto');
    expect(r.matches).toContain('window');
  });

  it('completes window ids (without the browser: prefix) for `browser use`', () => {
    const r = completeCommandLine('browser use ', 12, noFiles, [], conns);
    expect(r.matches.toSorted((a, b) => a.localeCompare(b))).toEqual(['w1', 'w2']);
    expect(completeCommandLine('browser use w1', 14, noFiles, [], conns).newInput).toBe('browser use w1 ');
  });

  it('completes `close` after `browser window`, then a window id', () => {
    expect(completeCommandLine('browser window ', 15, noFiles, [], conns).newInput).toBe(
      'browser window close ',
    );
    expect(completeCommandLine('browser window close ', 21, noFiles, [], conns).matches.toSorted((a, b) => a.localeCompare(b))).toEqual([
      'w1',
      'w2',
    ]);
  });
});

describe('completeCommandLine — syntax theme', () => {
  const noFiles = '/no/such/dir/xyz';

  it('completes "theme" for the first argument', () => {
    expect(completeCommandLine('syntax th', 9, noFiles).newInput).toBe('syntax theme ');
  });

  it('completes a theme name for the second argument', () => {
    expect(completeCommandLine('syntax theme nor', 16, noFiles).newInput).toBe('syntax theme nord ');
  });

  it('offers every theme for an empty second argument', () => {
    const r = completeCommandLine('syntax theme ', 13, noFiles);
    expect(r.matches).toContain('github-dark');
    expect(r.matches).toContain('nord');
  });
});
