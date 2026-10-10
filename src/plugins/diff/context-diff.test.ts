import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readChangeSet } from './change-set.js';
import { expandFullFileContext } from './context-diff.js';
import { isContextIntent, isDiffPayload } from './shared.js';

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

describe('full-file context', () => {
  it('reveals every line on request while the default diff stays compact', async () => {
    change();
    const compact = await readChangeSet(root);
    const expanded = await readChangeSet(root, new Set(['a.ts']));
    if (compact.kind !== 'files' || expanded.kind !== 'files') throw new Error('Missing fixture diff');
    expect(compact.files[0].hunks).toHaveLength(2);
    expect(expanded.files[0].hunks).toHaveLength(1);
    const lines = expanded.files[0].hunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind !== 'removed');
    expect(lines).toHaveLength(80);
    expect(lines[0]).toMatchObject({ number: 1, text: 'const value1 = 1;' });
    expect(lines.at(-1)).toMatchObject({ number: 80, text: 'const value80 = 80;' });
    expect(expanded.files[0]).toMatchObject({ contextLines: 1_000_000, additions: 2, deletions: 2 });
  });

  it('uses literal paths and supports renamed files', async () => {
    change('a[1].ts');
    const literal = await readChangeSet(root, new Set(['a[1].ts']));
    if (literal.kind !== 'files') throw new Error('Missing literal-path diff');
    expect(literal.files[0]).toMatchObject({ path: 'a[1].ts', contextLines: 1_000_000 });
    git('mv', 'a[1].ts', 'renamed.ts');
    const renamed = await readChangeSet(root, new Set(['renamed.ts']));
    if (renamed.kind !== 'files') throw new Error('Missing renamed diff');
    expect(renamed.files[0]).toMatchObject({ path: 'renamed.ts', oldPath: 'a[1].ts', contextLines: 1_000_000 });
  });

  it('keeps a failed expansion recoverable with its compact lines intact', async () => {
    change();
    const compact = await readChangeSet(root);
    if (compact.kind !== 'files') throw new Error('Missing fixture diff');
    git('update-ref', '-d', 'HEAD');
    const [failed] = await expandFullFileContext(root, compact.files, '', new Set(['a.ts']));
    expect(failed.hunks).toEqual(compact.files[0].hunks);
    expect(failed.contextError).toBeTruthy();
  });
});

describe('context guards', () => {
  it.each([null, [], {}, { path: '' }, { path: 1 }, { path: 'a.ts' }, { path: 'a.ts', fullFile: 'yes' }])
    ('rejects an invalid full-file request: %j', (value) => {
      expect(isContextIntent(value)).toBe(false);
    });

  it('accepts only full-file intent data and validates retained payload metadata', () => {
    expect(isContextIntent({ path: 'a.ts', fullFile: true })).toBe(true);
    expect(isContextIntent({ path: 'a.ts', fullFile: false })).toBe(true);
    const file = { path: 'a.ts', additions: 0, deletions: 0, hunks: [], contextLines: 1_000_000 };
    const payload = {
      instanceKey: 'diff', root: '', state: 'done', message: '', split: false, files: [file],
    };
    expect(isDiffPayload(payload)).toBe(true);
    for (const metadata of [{ contextLines: -1 }, { contextLines: 3.5 }, { contextLines: '23' }, { contextLines: 1_000_001 },
      { expandingContext: 'yes' }, { contextError: [] }]) {
      expect(isDiffPayload({ ...payload, files: [{ ...file, ...metadata }] })).toBe(false);
    }
  });
});
