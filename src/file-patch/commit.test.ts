import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { commitChanges } from './commit.js';
import { defaultCommitOperations, type CommitOperations } from './commit-operations.js';
import { parsePatchText } from './parse.js';
import { applySections } from './sections.js';
import { createPatchView } from './view.js';

let root: string;
beforeEach(() => { root = realpathSync(mkdtempSync(path.join(tmpdir(), 'janus-commit-'))); });
afterEach(() => {
  const names = readdirSync(root, { recursive: true });
  expect(names.filter((name) => name.endsWith('.tmp'))).toEqual([]);
  rmSync(root, { recursive: true, force: true });
});
const file = (name: string) => path.join(root, name);
function write(name: string, text: string, mode?: number): void {
  mkdirSync(path.dirname(file(name)), { recursive: true });
  writeFileSync(file(name), text);
  if (mode !== undefined) chmodSync(file(name), mode);
}
function changes(text: string) {
  const parsed = parsePatchText(text);
  if ('error' in parsed) throw new Error(JSON.stringify(parsed.error));
  const result = applySections(createPatchView(root), parsed.sections);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.changes;
}
function run(text: string, operations?: CommitOperations) { return commitChanges(changes(text), operations); }
const read = (name: string) => readFileSync(file(name), 'utf8');
const mode = (name: string) => statSync(file(name)).mode & 0o777;
const fail = () => Object.assign(new Error('injected'), { code: 'ENOSPC' });

it('commits nested additions, updates, deletions and moves while preserving modes and BOM', () => {
  write('edit', '\u{FEFF}old\n', 0o640); write('move', '\u{FEFF}old\n', 0o640); write('delete', 'old');
  expect(run('*** Add File: a/b/new\n+new\n*** Update File: edit\n@@\n-old\n+new\n*** Delete File: delete\n*** Update File: move\n*** Move to: moved\n@@\n-old\n+new')).toEqual({ ok: true });
  expect(read('a/b/new')).toBe('new\n'); expect(read('edit')).toBe('\u{FEFF}new\n');
  expect(read('moved')).toBe('\u{FEFF}new\n'); expect(mode('edit')).toBe(0o640); expect(mode('moved')).toBe(0o640);
  expect(existsSync(file('move'))).toBe(false); expect(existsSync(file('delete'))).toBe(false);
});

it('deletes, moves and updates links without replacing their targets', () => {
  write('target', 'old\n'); symlinkSync('target', file('delete')); symlinkSync('target', file('link'));
  expect(run('*** Delete File: delete\n*** Update File: link\n*** Move to: moved\n*** Update File: moved\n@@\n-old\n+new')).toEqual({ ok: true });
  expect(existsSync(file('delete'))).toBe(false); expect(read('target')).toBe('new\n');
  expect(lstatSync(file('moved')).isSymbolicLink()).toBe(true); expect(readlinkSync(file('moved'))).toBe('target');
});

it('handles replacement, vacated paths, exchanges and intermediate folders', () => {
  write('a', 'a\n'); write('b', 'b\n'); write('bom', '\u{FEFF}old\n', 0o600); write('target', 'target'); symlinkSync('target', file('link'));
  expect(run('*** Update File: a\n*** Move to: temp\n*** Update File: b\n*** Move to: a\n*** Update File: temp\n*** Move to: b\n*** Delete File: bom\n*** Add File: bom\n+new\n*** Delete File: link\n*** Add File: link\n+new')).toEqual({ ok: true });
  expect(read('a')).toBe('b\n'); expect(read('b')).toBe('a\n'); expect(existsSync(file('temp'))).toBe(false);
  expect(read('bom')).toBe('new\n'); expect(mode('bom')).toBe(0o666 & ~process.umask());
  expect(lstatSync(file('link')).isFile()).toBe(true); expect(read('target')).toBe('target');
  expect(run('*** Update File: a\n*** Move to: x/t\n*** Update File: x/t\n*** Move to: c\n*** Add File: a\n+added')).toEqual({ ok: true });
  expect(read('c')).toBe('b\n'); expect(read('a')).toBe('added\n'); expect(existsSync(file('x'))).toBe(true);
  expect(run('*** Delete File: a\n*** Update File: c\n*** Move to: a')).toEqual({ ok: true }); expect(read('a')).toBe('b\n');
});

it('restores prior writes, moves, deleted links and modes after a write failure', () => {
  write('edit', 'old\n'); write('move', 'move\n'); write('delete', 'delete\n', 0o640); write('target', 'target'); symlinkSync('target', file('link'));
  let writes = 0;
  const operations: CommitOperations = { ...defaultCommitOperations, writeFile(name, bytes) { writes += 1; if (writes === 3) throw fail(); defaultCommitOperations.writeFile(name, bytes); } };
  const result = run('*** Delete File: delete\n*** Delete File: link\n*** Update File: move\n*** Move to: moved\n*** Update File: edit\n@@\n-old\n+new\n*** Add File: link\n+replacement\n*** Add File: nested/fail\n+x', operations);
  expect(result).toMatchObject({ ok: false, restored: true, path: 'nested/fail', reason: expect.stringContaining('disk is full') });
  expect(read('edit')).toBe('old\n'); expect(read('move')).toBe('move\n'); expect(read('delete')).toBe('delete\n'); expect(mode('delete')).toBe(0o640);
  expect(readlinkSync(file('link'))).toBe('target'); expect(existsSync(file('moved'))).toBe(false); expect(existsSync(file('nested'))).toBe(false);
});

it('restores after rename and folder failures with the reported section path', () => {
  write('a', 'a'); write('delete', 'd');
  let renames = 0;
  const operations: CommitOperations = { ...defaultCommitOperations, rename(from, to) { renames += 1; if (renames === 2) throw fail(); defaultCommitOperations.rename(from, to); } };
  expect(run('*** Delete File: delete\n*** Update File: a\n*** Move to: x/t\n*** Update File: x/t\n*** Move to: b', operations)).toMatchObject({ ok: false, restored: true, path: 'x/t' });
  expect(read('a')).toBe('a'); expect(read('delete')).toBe('d'); expect(existsSync(file('x'))).toBe(false);
  let folders = 0;
  const mkdirFail: CommitOperations = { ...defaultCommitOperations, mkdir(name) { folders += 1; if (folders === 2) throw fail(); defaultCommitOperations.mkdir(name); } };
  expect(run('*** Add File: one/two/new\n+x', mkdirFail)).toMatchObject({ ok: false, restored: true, path: 'one/two/new' });
  expect(existsSync(file('one'))).toBe(false);
});

it('restores an intermediate folder collision and continues after an undo failure', () => {
  write('a', 'a');
  expect(run('*** Update File: a\n*** Move to: x/b\n*** Update File: x/b\n*** Move to: c\n*** Add File: x\n+x')).toMatchObject({ ok: false, restored: true, path: 'x' });
  expect(read('a')).toBe('a'); expect(existsSync(file('x'))).toBe(false);
  write('first', 'old\n'); write('second', 'old\n');
  let calls = 0;
  const operations: CommitOperations = { ...defaultCommitOperations, writeFile(name, bytes) { calls += 1; if (calls === 3) throw fail(); if (calls === 4) throw Object.assign(new Error('undo failed'), { code: 'EACCES' }); defaultCommitOperations.writeFile(name, bytes); } };
  expect(run('*** Update File: first\n@@\n-old\n+new\n*** Update File: second\n@@\n-old\n+new\n*** Add File: fail\n+x', operations)).toMatchObject({ ok: false, restored: false, path: 'fail', reason: 'The disk is full; free some space, then try again' });
  expect(read('first')).toBe('old\n'); expect(read('second')).toBe('new\n');
});

it('leaves a folder filled by another process without reporting a restore failure', () => {
  const operations: CommitOperations = { ...defaultCommitOperations, writeFile() { writeFileSync(file('new/other'), 'external'); throw fail(); } };
  expect(run('*** Add File: new/file\n+x', operations)).toMatchObject({ ok: false, restored: true, path: 'new/file' });
  expect(read('new/other')).toBe('external');
});

it('keeps folders emptied by deletes and moves', () => {
  write('deleted/file', 'x'); write('moved/file', 'y');
  expect(run('*** Delete File: deleted/file\n*** Update File: moved/file\n*** Move to: destination')).toEqual({ ok: true });
  expect(readdirSync(file('deleted'))).toEqual([]); expect(readdirSync(file('moved'))).toEqual([]);
});

it('reports the first rename destination for shared and nested folders before writes', () => {
  write('source', 'old');
  const patch = '*** Add File: shared/nested/first\n+x\n*** Update File: source\n*** Move to: shared/nested/moved\n*** Add File: shared/other/last\n+y';
  for (const target of ['shared', 'shared/nested', 'shared/other']) {
    const operations: CommitOperations = { ...defaultCommitOperations, mkdir(name) { if (name === file(target)) throw fail(); defaultCommitOperations.mkdir(name); } };
    const expected = target === 'shared/other' ? 'shared/other/last' : 'shared/nested/moved';
    expect(run(patch, operations)).toMatchObject({ ok: false, restored: true, path: expected });
    expect(existsSync(file('shared'))).toBe(false);
  }
});

it('indexes folder reports without scanning every write for each folder', () => {
  const initial = changes('*** Add File: sample/file\n+x');
  const template = initial.writes[0];
  let reads = 0;
  const writes = Array.from({ length: 1000 }, (_, index) => ({
    ...template,
    get place() {
      reads += 1;
      return { ...template.place, location: file(`folder-${index}/file`), requested: `folder-${index}/file` };
    },
  }));
  const folders = [...writes.map((_, index) => file(`folder-${index}`)), file('unmatched')];
  const operations: CommitOperations = { ...defaultCommitOperations, mkdir(name) { if (name === file('unmatched')) throw fail(); }, rmdir() {} };
  expect(commitChanges({ ...initial, folders, writes }, operations)).toMatchObject({ ok: false, restored: true, path: '' });
  expect(reads).toBeLessThanOrEqual(1000);
});
