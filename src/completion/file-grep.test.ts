import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { completeFileGrepArgument } from './file-grep.js';
import { completeFilePath } from './fs.js';
import { completeFileReadCommand } from './file-read.js';
import { completeCommandLine } from './index.js';
import { readCompletionCursor } from './cursor.js';
import { completionPolicy, type CompletionPolicy } from './command-policy.js';
import { NativeCommandSettingsManager } from '../native-commands/manager.js';

vi.mock(import('./fs.js'), { spy: true });

const FLAGS = ['--case-sensitive', '--exclude', '--include', '--limit', '--literal', '--path', '--word'];

const at = (line: string, cursor = line.length) => readCompletionCursor(line, cursor);

function expectUnchanged(line: string, pathRoot?: string): void {
  const result = completeFileGrepArgument(at(line), pathRoot);
  expect(result).toEqual({ newInput: line, newCursor: line.length, matches: [] });
}

let root: string;
let cwd: string;
let settings: string;

function policyWith(values: Record<string, { enabled?: boolean }>): CompletionPolicy {
  const home = path.join(settings, 'home');
  mkdirSync(path.join(home, '.janissary'), { recursive: true });
  writeFileSync(path.join(home, '.janissary', 'commands.json'), JSON.stringify(values));
  return completionPolicy(new NativeCommandSettingsManager(path.join(settings, 'project'), home).current());
}

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'file-grep-completion-root-'));
  cwd = mkdtempSync(path.join(tmpdir(), 'file-grep-completion-cwd-'));
  settings = mkdtempSync(path.join(tmpdir(), 'file-grep-completion-settings-'));
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'dogs.md'), '');
  writeFileSync(path.join(root, 'notable.md'), '');
  writeFileSync(path.join(cwd, 'notes.md'), '');
  writeFileSync(path.join(cwd, 'cwd-only.md'), '');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
  rmSync(settings, { recursive: true, force: true });
});

describe('completeFileGrepArgument flags', () => {
  it('offers the seven flags for a current -- and keeps the cursor', () => {
    const line = 'file grep --';
    expect(completeFileGrepArgument(at(line), root))
      .toEqual({ newInput: line, newCursor: line.length, matches: FLAGS });
  });

  it.each([
    ['--c', '--case-sensitive'],
    ['--e', '--exclude'],
    ['--i', '--include'],
    ['--lim', '--limit'],
    ['--lit', '--literal'],
    ['--p', '--path'],
    ['--w', '--word'],
  ])('completes the %s prefix to %s with a trailing space', (prefix, flag) => {
    const completed = `file grep ${flag} `;
    expect(completeFileGrepArgument(at(`file grep ${prefix}`), root))
      .toEqual({ newInput: completed, newCursor: completed.length, matches: [flag] });
  });

  it('offers no flags for an uppercase current prefix', () => {
    expectUnchanged('file grep --P', root);
  });
});

describe('completeFileGrepArgument scanner', () => {
  it.each([
    ['--literal', '--p', '--path'],
    ['--word', '--inc', '--include'],
    ['--case-sensitive', '--lit', '--literal'],
  ])('a committed %s leaves the next flag prefix eligible', (flag, prefix, flagName) => {
    const completed = `file grep ${flag} ${flagName} `;
    expect(completeFileGrepArgument(at(`file grep ${flag} ${prefix}`), root))
      .toEqual({ newInput: completed, newCursor: completed.length, matches: [flagName] });
  });

  it.each([
    ['--path src', '--p', '--path'],
    ['--include src', '--w', '--word'],
    ['--exclude src', '--c', '--case-sensitive'],
    ['--limit 5', '--e', '--exclude'],
  ])('a committed %s consumes its ordinary value', (committed, prefix, flagName) => {
    const completed = `file grep ${committed} ${flagName} `;
    expect(completeFileGrepArgument(at(`file grep ${committed} ${prefix}`), root))
      .toEqual({ newInput: completed, newCursor: completed.length, matches: [flagName] });
  });

  it.each([
    ['--path --word', '--c', '--case-sensitive'],
    ['--include --', '--p', '--path'],
    ['--exclude --limit', '--i', '--include'],
    ['--limit --path', '--w', '--word'],
  ])('a committed %s consumes a flag-looking value', (committed, prefix, flagName) => {
    const completed = `file grep ${committed} ${flagName} `;
    expect(completeFileGrepArgument(at(`file grep ${committed} ${prefix}`), root))
      .toEqual({ newInput: completed, newCursor: completed.length, matches: [flagName] });
  });
});

describe('completeFileGrepArgument pending values', () => {
  it.each([['--include'], ['--exclude'], ['--limit']])(
    'offers nothing for a pending %s value',
    (flag) => {
      for (const current of ['', 'src', '--p']) expectUnchanged(`file grep ${flag} ${current}`, root);
    },
  );
});

describe('completeFileGrepArgument state boundaries', () => {
  it('leaves ordinary pattern text unchanged', () => {
    expectUnchanged('file grep TOD', root);
  });

  it('suppresses flag and path candidates after a committed pattern', () => {
    expectUnchanged('file grep TODO --p', root);
    expectUnchanged('file grep TODO --path do', root);
  });

  it('suppresses everything after a committed terminator', () => {
    expectUnchanged('file grep -- --p', root);
    expectUnchanged('file grep -- --path do', root);
  });

  it('starts the pattern at an uppercase committed option', () => {
    expectUnchanged('file grep --PATH --p', root);
    expectUnchanged('file grep --Literal --p', root);
  });

  it('starts the pattern at an unknown committed option, including equals syntax', () => {
    expectUnchanged('file grep --unknown --p', root);
    expectUnchanged('file grep --limit=5 --p', root);
  });

  it('starts the pattern at a single-dash committed token', () => {
    expectUnchanged('file grep -x --p', root);
  });

  it('leaves an empty current token before the pattern unchanged', () => {
    expectUnchanged('file grep ', root);
  });

  it('keeps a pending --path on path completion when the current token is --', () => {
    expectUnchanged('file grep --path --', root);
  });

  it('keeps already used flags as candidates', () => {
    const completed = 'file grep --literal --literal ';
    expect(completeFileGrepArgument(at('file grep --literal --lit'), root))
      .toEqual({ newInput: completed, newCursor: completed.length, matches: ['--literal'] });
    expect(completeFileGrepArgument(at('file grep --literal --path notes.md --'), root).matches).toEqual(FLAGS);
  });

  it('keeps quotes and backslashes as ordinary cursor text without shell decoding', () => {
    expectUnchanged('file grep "TO', root);
    expectUnchanged(String.raw`file grep src\fi`, root);
    expectUnchanged('file grep --path "do', root);
    expectUnchanged(String.raw`file grep --path src\fi`, root);
  });
});

describe('completeFileGrepArgument path values', () => {
  it('completes a unique file with a trailing space', () => {
    const completed = 'file grep --path dogs.md ';
    expect(completeFileGrepArgument(at('file grep --path dog'), root))
      .toEqual({ newInput: completed, newCursor: completed.length, matches: ['dogs.md'] });
  });

  it('completes a unique directory with a trailing slash', () => {
    vi.mocked(completeFilePath).mockClear();
    const completed = 'file grep --path docs/';
    expect(completeFileGrepArgument(at('file grep --path doc'), root))
      .toEqual({ newInput: completed, newCursor: completed.length, matches: ['docs'] });
    expect(vi.mocked(completeFilePath)).toHaveBeenCalledTimes(1);
  });

  it('extends a prefix shared by a file and a directory without a suffix', () => {
    const line = 'file grep --path do';
    expect(completeFileGrepArgument(at(line), root))
      .toEqual({ newInput: line, newCursor: line.length, matches: ['docs', 'dogs.md'] });
  });

  it('offers nothing for a missing directory', () => {
    expectUnchanged('file grep --path missing/', root);
  });

  it('offers no paths without a root and never calls the path helper', () => {
    vi.mocked(completeFilePath).mockClear();
    for (const token of ['not', `${root}/not`, '~/not']) expectUnchanged(`file grep --path ${token}`);
    expect(vi.mocked(completeFilePath)).not.toHaveBeenCalled();
  });
});

describe('completeFileGrepArgument cursor', () => {
  it('completes a flag in the middle of a line and preserves the tail', () => {
    const line = 'file grep --p TODO --limit 5';
    const result = completeFileGrepArgument(at(line, 'file grep --p'.length), root);
    expect(result.newInput).toBe('file grep --path  TODO --limit 5');
    expect(result.newCursor).toBe('file grep --path '.length);
    expect(result.newInput.slice(result.newCursor)).toBe(' TODO --limit 5');
    expect(result.matches).toEqual(['--path']);
  });

  it('completes a path value in the middle of a line and preserves the tail', () => {
    const line = 'file grep --path doc TODO --word';
    const result = completeFileGrepArgument(at(line, 'file grep --path doc'.length), root);
    expect(result.newInput).toBe('file grep --path docs/ TODO --word');
    expect(result.newCursor).toBe('file grep --path docs/'.length);
    expect(result.newInput.slice(result.newCursor)).toBe(' TODO --word');
    expect(result.matches).toEqual(['docs']);
  });
});

describe('file grep completion integration', () => {
  it('offers grep as a subcommand and keeps file g ambiguous', () => {
    expect(completeFileReadCommand(at('file gr'), root)).toEqual({
      newInput: 'file grep ', newCursor: 'file grep '.length, matches: ['grep'],
    });
    expect(completeFileReadCommand(at('file '), root)?.matches)
      .toEqual(['exists', 'glob', 'grep', 'head', 'list', 'ls', 'read', 'stat', 'tail']);
    expect(completeFileReadCommand(at('file g'), root))
      .toEqual({ newInput: 'file g', newCursor: 'file g'.length, matches: ['glob', 'grep'] });
    expect(completeCommandLine('file g', 6, cwd).matches).toEqual(['glob', 'grep']);
  });

  it('drops a disabled grep child without removing read or glob', () => {
    const policy = policyWith({ 'file grep': { enabled: false } });
    expect(completeFileReadCommand(at('file '), root, policy)?.matches)
      .toEqual(['exists', 'glob', 'head', 'list', 'ls', 'read', 'stat', 'tail']);
    expect(completeFileReadCommand(at('file gr'), root, policy)?.matches).toEqual([]);
    expect(completeCommandLine('file ', 5, cwd, [], [], undefined, undefined, undefined, undefined, policy).matches)
      .toEqual(['exists', 'glob', 'head', 'list', 'ls', 'read', 'stat', 'tail']);
    const line = 'file grep --p';
    expect(completeCommandLine(line, line.length, cwd, [], [], undefined, undefined, undefined, undefined, policy))
      .toEqual({ newInput: line, newCursor: line.length, matches: [] });
  });

  it('suppresses every file candidate and argument under a disabled file parent', () => {
    const policy = policyWith({ file: { enabled: false } });
    for (const line of ['file ', 'file grep --path do']) {
      expect(completeCommandLine(line, line.length, cwd, [], [], undefined, undefined, undefined, undefined, policy))
        .toEqual({ newInput: line, newCursor: line.length, matches: [] });
    }
  });

  it('routes mixed-case file grep and keeps flags lowercase', () => {
    const completed = 'FiLe GrEp --path ';
    expect(completeCommandLine('FiLe GrEp --p', 13, cwd))
      .toEqual({ newInput: completed, newCursor: completed.length, matches: ['--path'] });
    const upper = 'FiLe GrEp --P';
    expect(completeCommandLine(upper, upper.length, cwd))
      .toEqual({ newInput: upper, newCursor: upper.length, matches: [] });
  });

  it('completes grep paths from the file-read root rather than the shell directory', () => {
    const line = 'file grep --path not';
    const completed = 'file grep --path notable.md ';
    expect(completeCommandLine(line, line.length, cwd, [], [], undefined, undefined, undefined, undefined, undefined, root))
      .toEqual({ newInput: completed, newCursor: completed.length, matches: ['notable.md'] });
    expect(completeCommandLine('file grep --path cwd', 20, cwd, [], [], undefined, undefined, undefined, undefined,
      undefined, root).matches).toEqual([]);
  });

  it('offers no grep paths without a file-read root even when the shell directory matches', () => {
    const line = 'file grep --path not';
    expect(completeCommandLine(line, line.length, cwd))
      .toEqual({ newInput: line, newCursor: line.length, matches: [] });
  });

  it('offers nothing in pattern state even when the shell directory has a matching name', () => {
    const line = 'file grep not';
    expect(completeCommandLine(line, line.length, cwd))
      .toEqual({ newInput: line, newCursor: line.length, matches: [] });
  });
});

describe('neighboring file command completion', () => {
  it('keeps file read paths, flags and value suppression unchanged', () => {
    expect(completeFileReadCommand(at('file read not'), root)?.newInput).toBe('file read notable.md ');
    expect(completeFileReadCommand(at('file read notable.md --'), root)?.matches)
      .toEqual(['--limit', '--offset']);
    expect(completeFileReadCommand(at('file read notable.md --limit '), root)?.matches).toEqual([]);
  });

  it('keeps file glob flags, directory-only paths and pattern suppression unchanged', () => {
    expect(completeFileReadCommand(at('file glob * --'), root)?.matches)
      .toEqual(['--dirs', '--hidden', '--limit', '--path']);
    expect(completeFileReadCommand(at('file glob * --path doc'), root)?.newInput)
      .toBe('file glob * --path docs/');
    expect(completeFileReadCommand(at('file glob * --path dog'), root)?.matches).toEqual([]);
    expect(completeFileReadCommand(at('file glob dogs'), root)?.matches).toEqual([]);
  });
});
