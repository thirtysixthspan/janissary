import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { completeCommandLine } from './index.js';
import { completionPolicy, type CompletionPolicy } from './command-policy.js';
import { listApplicationCommands } from '../application-commands.js';
import { BUNDLED_MODEL_CATALOG } from '../models/catalog-file.js';

const modelsFor = (harness: string) => (BUNDLED_MODEL_CATALOG[harness] ?? [])
  .filter(({ disabled }) => disabled !== true)
  .map(({ id }) => id);

function policyWith(disabled: readonly string[]): CompletionPolicy {
  const commands = listApplicationCommands().map((row) => ({
    ...row,
    enabled: true,
    agentAccess: true,
    effectiveEnabled: !disabled.includes(row.name),
    effectiveAgentAccess: !disabled.includes(row.name),
  }));
  return completionPolicy({ commands, source: 'default', path: '' });
}

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

  it('completes the token on a continuation line of a multi-line command', () => {
    expect(completeCommandLine('ls\nsrc', 6, dir).newInput).toBe('ls\nsrcdir/');
    expect(completeCommandLine('cat report.txt\nuni', 18, dir).newInput).toBe('cat report.txt\nunique.log ');
  });

  it('returns no matches for an unknown prefix', () => {
    const r = completeCommandLine('cat zzz', 7, dir);
    expect(r.matches).toEqual([]);
    expect(r.newInput).toBe('cat zzz');
  });

  it('completes help page names and does not fall through to file paths', () => {
    expect(completeCommandLine('help pro', 8, dir).newInput).toBe('help profile ');
    expect(completeCommandLine('help zzz', 8, dir).matches).toEqual([]);
  });

  it('routes files completion through its command-specific handler', () => {
    const files = { labels: [], navigators: [], workingDirOf: () => { return; } };
    expect(completeCommandLine('files on l', 10, dir, [], [], undefined, undefined, files).newInput)
      .toBe('files on left ');
  });

  it('routes tab subcommand completion through the command-line chain', () => {
    expect(completeCommandLine('tab mo', 6, dir, ['janus']).newInput).toBe('tab move ');
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

describe('completeCommandLine — system schedule grammar', () => {
  const options = { names: ['alpha', 'nightly'], scripts: ['deploy', 'test-suite'] };
  const noFiles = '/no/such/dir/xyz';

  it('completes system subcommands, form keywords, and recurrence alternatives', () => {
    expect(completeCommandLine('schedule sys', 12, noFiles, [], [], undefined, options).newInput)
      .toBe('schedule system ');
    expect(completeCommandLine('schedule system ca', 18, noFiles, [], [], undefined, options).newInput)
      .toBe('schedule system cancel ');
    expect(completeCommandLine('schedule system job ', 20, noFiles, [], [], undefined, options).matches)
      .toEqual(['at', 'every', 'on']);
    expect(completeCommandLine('schedule system job every ', 27, noFiles, [], [], undefined, options).matches)
      .toContain('monday');
    expect(completeCommandLine('schedule system job every monday ', 34, noFiles, [], [], undefined, options).newInput)
      .toBe('schedule system job every monday at ');
    expect(completeCommandLine('schedule system job on 8/12 ', 29, noFiles, [], [], undefined, options).newInput)
      .toBe('schedule system job on 8/12 at ');
  });

  it('completes system cancellation names and script catalog names only in their slots', () => {
    expect(completeCommandLine('schedule system cancel ni', 25, noFiles, [], [], undefined, options).newInput)
      .toBe('schedule system cancel nightly ');
    expect(completeCommandLine('schedule system job at 3pm script dep', 37, noFiles, [], [], undefined, options).newInput)
      .toBe('schedule system job at 3pm script deploy ');
    expect(completeCommandLine('schedule system job at 3pm script ', 35, noFiles, [], [], undefined, options).matches)
      .toEqual(['deploy', 'test-suite']);
  });
});

describe('completeCommandLine — connection strings', () => {
  const noFiles = '/no/such/dir/xyz';
  const conns = ['shell:bash', 'acp:opencode', 'sqlite:movies', 'sqlite:shop'];

  it('completes a unique connection string and adds a space', () => {
    expect(completeCommandLine('connections close acp', 21, noFiles, [], conns).newInput).toBe(
      'connections close acp:opencode ',
    );
  });

  it('fills the common prefix when several connections match', () => {
    const r = completeCommandLine('connections close sq', 20, noFiles, [], conns);
    expect(r.newInput).toBe('connections close sqlite:');
    expect(r.matches.toSorted((a, b) => a.localeCompare(b))).toEqual(['sqlite:movies', 'sqlite:shop']);
  });

  it('offers every open connection for an empty target', () => {
    const r = completeCommandLine('connections close ', 18, noFiles, [], conns);
    expect(r.matches.toSorted((a, b) => a.localeCompare(b))).toEqual(['acp:opencode', 'shell:bash', 'sqlite:movies', 'sqlite:shop']);
  });

  it('does not offer connections for `connections list` or the command word', () => {
    expect(completeCommandLine('connections lis', 15, noFiles, [], conns).matches).toEqual([]);
    expect(completeCommandLine('connections close ', 18, noFiles, [], []).matches).toEqual([]);
    expect(completeCommandLine('connection close ', 17, noFiles, [], conns).matches).toEqual([]);
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

describe('completeCommandLine — layout command', () => {
  const noFiles = '/no/such/dir/xyz';

  it('completes subcommands from the parser keyword list', () => {
    const result = completeCommandLine('layout ', 7, noFiles);
    expect(result.matches).toEqual(['reporting', 'show', 'sidebar', 'split', 'window']);
  });

  it('completes the sidebar subcommand and its side choices', () => {
    expect(completeCommandLine('layout sid', 10, noFiles).newInput).toBe('layout sidebar ');
    expect(completeCommandLine('layout sidebar ', 15, noFiles).matches).toEqual(['left', 'right']);
  });
});

describe('completeCommandLine — harness model', () => {
  const noFiles = '/no/such/dir/xyz';

  // The prefix is derived from the catalog rather than fixed, so this pins the routing rather than the
  // catalog's contents: any fixed prefix goes ambiguous once a refresh adds a model beside it.
  it('completes a model name after --model for the named harness', () => {
    const claude = modelsFor('claude');
    const model = claude.find((id) => claude.filter((other) => other.startsWith(id.slice(0, -1))).length === 1)!;
    const line = `harness claude --model ${model.slice(0, -1)}`;
    const r = completeCommandLine(line, line.length, noFiles, [], [], undefined, undefined, undefined, modelsFor);
    expect(r.newInput).toBe(`harness claude --model ${model} `);
  });

  it('does not offer models without a catalog lookup', () => {
    const line = 'harness claude --model claude-sonnet';

    expect(completeCommandLine(line, line.length, noFiles).newInput).toBe(line);
    expect(completeCommandLine(line, line.length, noFiles).matches).toEqual([]);
  });

  it('does not suggest a disabled model from the supplied catalog lookup', () => {
    const line = 'harness claude --model disabled';
    const enabledModels = (harness: string) => harness === 'claude' ? ['enabled-model'] : [];

    expect(completeCommandLine(line, line.length, noFiles, [], [], undefined, undefined, undefined, enabledModels).matches)
      .toEqual([]);
  });
});

describe('completeCommandLine — runscript commands', () => {
  const scripts = ['deploy', 'test-suite'];
  const noFiles = '/no/such/dir/xyz';

  it('completes execute names only in its single name slot', () => {
    expect(completeCommandLine('execute dep', 11, noFiles, [], [], undefined, { names: [], scripts }).newInput)
      .toBe('execute deploy ');
    expect(completeCommandLine('execute ', 8, noFiles, [], [], undefined, { names: [], scripts }).matches)
      .toEqual(scripts);
    expect(completeCommandLine('execute deploy extra', 20, noFiles, [], [], undefined, { names: [], scripts }).matches)
      .toEqual([]);
  });

  it('combines bare edit script names with file matches but leaves paths to filesystem completion', () => {
    expect(completeCommandLine('edit dep', 8, noFiles, [], [], undefined, { names: [], scripts }).newInput)
      .toBe('edit deploy ');
    expect(completeCommandLine('edit src/dep', 12, noFiles, [], [], undefined, { names: [], scripts }).matches)
      .toEqual([]);
    expect(completeCommandLine('edit deploy.ts', 14, noFiles, [], [], undefined, { names: [], scripts }).matches)
      .toEqual([]);
  });
});

describe('completeCommandLine — application command names', () => {
  it('completes an enabled command name and alias from the first token', () => {
    expect(completeCommandLine('bro', 3, dir).newInput).toBe('browser ');
    expect(completeCommandLine('exi', 3, dir).newInput).toBe('exit ');
  });

  it('merges command names with file candidates, commands first', () => {
    const r = completeCommandLine('re', 2, dir);

    expect(r.newInput).toBe('re');
    expect(r.matches).toEqual(['rename', 'report.txt']);
  });

  it('hides a disabled command while a same-prefix file remains', () => {
    const policy = policyWith(['rename']);

    expect(completeCommandLine('re', 2, dir, [], [], undefined, undefined, undefined, undefined, policy).newInput)
      .toBe('report.txt ');
    expect(completeCommandLine('bro', 3, dir, [], [], undefined, undefined, undefined, undefined, policy).newInput)
      .toBe('browser ');
  });

  it('leaves the existing filesystem completion for an empty token, a leading slash, and path separators', () => {
    const empty = completeCommandLine('', 0, dir);
    expect(empty.matches).toContain('report.txt');
    expect(empty.matches).not.toContain('browser');

    const absolute = completeCommandLine('/re', 3, dir);
    expect(absolute.matches).not.toContain('rename');

    expect(completeCommandLine('./re', 4, dir).newInput).toBe('./report.txt ');
    expect(completeCommandLine(String.raw`src\re`, 6, dir).matches).toEqual([]);
    expect(completeCommandLine('"re', 3, dir).matches).toEqual([]);
  });

  it('keeps ! lines on the existing fallback completion', () => {
    const policy = policyWith(['shell']);

    expect(completeCommandLine('!ls', 3, dir, [], [], undefined, undefined, undefined, undefined, policy).newInput)
      .toBe('!ls');
    expect(completeCommandLine('!ls', 3, dir).matches).toEqual([]);
  });

  it('keeps disabled command pages completable while help is enabled', () => {
    const policy = policyWith(['browser', 'browser content', 'browser goto', 'browser eval']);

    expect(completeCommandLine('help bro', 8, dir, [], [], undefined, undefined, undefined, undefined, policy).newInput)
      .toBe('help browser ');
  });
});

describe('completeCommandLine — disabled command guard', () => {
  const noFiles = '/no/such/dir/xyz';

  it('suppresses argument and path completion under a disabled command', () => {
    const policy = policyWith(['browser', 'browser content', 'browser goto', 'browser eval']);
    const line = 'browser co';

    expect(completeCommandLine(line, line.length, dir, [], [], undefined, undefined, undefined, undefined, policy))
      .toEqual({ newInput: line, newCursor: line.length, matches: [] });
  });

  it('guards every command-specific completer', () => {
    const labels = ['janus'];
    const scripts = { names: [], scripts: ['deploy'] };
    const cases: [string, string][] = [
      ['send jan', 'send'],
      ['tab mo', 'tab'],
      ['files on l', 'files'],
      ['edit dep', 'edit'],
      ['schedule system ca', 'schedule'],
      ['help bro', 'help'],
    ];

    for (const [line, name] of cases) {
      const result = completeCommandLine(
        line, line.length, noFiles, labels, [], undefined, scripts, undefined, undefined, policyWith([name]),
      );
      expect(result.newInput, name).toBe(line);
      expect(result.matches, name).toEqual([]);
    }
  });
});
