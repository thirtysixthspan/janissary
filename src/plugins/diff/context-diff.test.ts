import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readChangeSet } from './change-set.js';
import { expandContextFiles } from './context-diff.js';
import { isContextIntent, isDiffPayload } from './shared.js';
import type { DiffFile } from './shared.js';

let root: string;
const source = Array.from({ length: 80 }, (_, index) => `const value${index + 1} = ${index + 1};`);
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });

beforeEach(() => {
  mkdirSync('temp', { recursive: true });
  root = mkdtempSync(path.join(process.cwd(), 'temp/diff-context-'));
  git('init', '-b', 'master');
  git('config', 'user.email', 'test@test.com');
  git('config', 'user.name', 'test');
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function change(fileName = 'a.ts'): void {
  writeFileSync(path.join(root, fileName), `${source.join('\n')}\n`);
  git('add', '--', fileName);
  git('commit', '-m', 'initial');
  const changed = [...source];
  changed[15] = 'const value16 = 999;';
  changed[45] = 'const value46 = 999;';
  writeFileSync(path.join(root, fileName), `${changed.join('\n')}\n`);
}

async function file(context = 3, fileName = 'a.ts'): Promise<DiffFile> {
  const result = await readChangeSet(root, new Map([[fileName, context]]));
  if (result.kind !== 'files' || result.files.length !== 1) throw new Error('Missing fixture diff');
  return result.files[0];
}

describe('context expansion', () => {
  it('reveals surrounding lines and merges hunks without changing counts or line positions', async () => {
    change();
    const initial = await file();
    const expanded = await file(23);
    expect(initial.hunks).toHaveLength(2);
    expect(expanded.hunks).toHaveLength(1);
    expect(expanded.hunks[0].lines.length).toBeGreaterThan(initial.hunks.flatMap((hunk) => hunk.lines).length);
    expect(expanded).toMatchObject({ contextLines: 23, canExpandContext: true, additions: 2, deletions: 2 });
    expect(expanded.hunks[0].lines[0]).toMatchObject({ kind: 'context', oldNumber: 1, number: 1, jump: 1 });
    expect(expanded.hunks[0].lines.find((line) => line.kind === 'added')).toMatchObject({ number: 16, jump: 16 });
  });

  it('reports exhausted context and keeps expanded results on another read', async () => {
    change();
    const expanded = await file(100);
    expect(expanded.canExpandContext).toBe(false);
    expect(expanded.hunks[0].lines.filter((line) => line.kind !== 'removed')).toHaveLength(80);
    expect(await file(100)).toEqual(expanded);
  });

  it('reads every line of a changed file when full-file context is requested', async () => {
    change();
    const expanded = await file(1_000_000);
    const lines = expanded.hunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind !== 'removed');
    expect(lines).toHaveLength(80);
    expect(lines[0]).toMatchObject({ number: 1, text: 'const value1 = 1;' });
    expect(lines.at(-1)).toMatchObject({ number: 80, text: 'const value80 = 80;' });
    expect(expanded.canExpandContext).toBe(false);
  });

  it.each(['top', 'between', 'bottom'] as const)('expands only the selected %s boundary', async (position) => {
    change();
    const initial = await file();
    const boundary = initial.contextBoundaries?.find((item) => item.position === position);
    expect(boundary).toBeTruthy();
    const result = await readChangeSet(root, new Map(), new Map([['a.ts', new Set([boundary!.id])]]));
    if (result.kind !== 'files') throw new Error('Missing expanded diff');
    const expanded = result.files[0];
    expect(expanded.additions).toBe(2);
    expect(expanded.deletions).toBe(2);
    expect(expanded.contextBoundaries?.some((item) => item.id === boundary!.id)).toBe(false);
    if (position === 'top') {
      expect(expanded.hunks[0].lines[0]).toMatchObject({ kind: 'context', oldNumber: 1, number: 1 });
      expect(expanded.hunks).toHaveLength(2);
    } else if (position === 'bottom') {
      expect(expanded.hunks.at(-1)?.lines.at(-1)).toMatchObject({ kind: 'context', oldNumber: 80, number: 80 });
      expect(expanded.hunks).toHaveLength(2);
    } else {
      expect(expanded.hunks).toHaveLength(1);
      expect(expanded.hunks[0].lines.filter((line) => line.kind === 'context')).toHaveLength(35);
    }
    const refreshed = await readChangeSet(root, new Map(), new Map([['a.ts', new Set([boundary!.id])]]));
    expect(refreshed).toEqual(result);
  });

  it('uses literal pathspecs for names containing glob characters', async () => {
    change('a[1].ts');
    expect(await file(23, 'a[1].ts')).toMatchObject({ path: 'a[1].ts', contextLines: 23, additions: 2, deletions: 2 });
  });

  it('expands renamed files using both paths', async () => {
    change('old file.ts');
    git('mv', 'old file.ts', 'new file.ts');
    expect(await file(23, 'new file.ts')).toMatchObject({ path: 'new file.ts', oldPath: 'old file.ts', contextLines: 23 });
  });

  it('keeps context failures recoverable instead of failing the change set', async () => {
    change();
    const initial = await file();
    const boundary = initial.contextBoundaries?.[0];
    git('update-ref', '-d', 'HEAD');
    const [boundaryFailure] = await expandContextFiles(root, [initial], '', new Map(),
      new Map([['a.ts', new Set([boundary!.id])]]));
    expect(boundaryFailure.contextBoundaries?.find((item) => item.id === boundary!.id)?.error).toBeTruthy();
    const [failed] = await expandContextFiles(root, [initial], '', new Map([['a.ts', 23]]));
    expect(failed.hunks).toEqual(initial.hunks);
    expect(failed.contextError).toBeTruthy();
    expect(failed.canExpandContext).toBe(true);
  });
});

describe('context guards', () => {
  it.each([null, [], {}, { path: '' }, { path: 1 }, { path: 'a.ts', fullFile: 'yes' }, { path: 'a.ts', boundary: '' },
    { path: 'a.ts', boundary: 'top:x', fullFile: true }])('rejects an invalid expansion request: %j', (value) => {
    expect(isContextIntent(value)).toBe(false);
  });

  it('accepts a filename request and validates optional context metadata', () => {
    expect(isContextIntent({ path: 'a.ts' })).toBe(true);
    expect(isContextIntent({ path: 'a.ts', fullFile: true })).toBe(true);
    expect(isContextIntent({ path: 'a.ts', fullFile: false })).toBe(true);
    expect(isContextIntent({ path: 'a.ts', boundary: 'between:removed:1:1:added:0:2' })).toBe(true);
    const file = { path: 'a.ts', additions: 0, deletions: 0, hunks: [], contextLines: 23, canExpandContext: true };
    const payload = { root: '', state: 'done', message: '', split: false, files: [file] };
    expect(isDiffPayload(payload)).toBe(true);
    for (const metadata of [{ contextLines: -1 }, { contextLines: 3.5 }, { contextLines: '23' }, { contextLines: 1_000_001 },
      { canExpandContext: 1 }, { expandingContext: 'yes' }, { contextError: [] }]) {
      expect(isDiffPayload({ ...payload, files: [{ ...file, ...metadata }] })).toBe(false);
    }
    expect(isDiffPayload({ ...payload, files: [{ ...file, contextBoundaries: [{ id: 'top:x', position: 'sideways' }] }] })).toBe(false);
  });
});
