import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { searchText } from './search-text.js';
import type { SearchRequest } from '../search/types.js';

const roots: string[] = [];
const plain: SearchRequest = {
  query: 'todo', include: '', exclude: '', regex: false, matchCase: false, wholeWord: false,
};

function project(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'remote-search-'));
  roots.push(root);
  return root;
}

function write(root: string, relativePath: string, contents: string | Uint8Array): void {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('searchText', () => {
  it('applies the same include and exclude patterns and returns matching context', async () => {
    const root = project();
    write(root, 'src/a.ts', 'above\nTODO fix\nbelow');
    write(root, 'src/b.ts', 'todo excluded');
    write(root, 'notes.md', 'todo outside include');

    const rows = await searchText(root, {
      ...plain, include: 'src', exclude: 'src/b.ts', query: 'TODO', matchCase: true,
    });

    expect(rows).toEqual([{
      path: 'src/a.ts', line: 2, above: ['above'], match: 'TODO fix', start: 0, end: 4, below: ['below'],
    }]);
  });

  it('skips binary files and files above the editor size limit', async () => {
    const root = project();
    write(root, 'binary.txt', 'todo\0hidden');
    write(root, 'large.txt', `${'x'.repeat(2 * 1024 * 1024)}todo`);
    write(root, 'small.txt', 'todo here');

    const rows = await searchText(root, plain);

    expect(rows.map((row) => row.path)).toEqual(['small.txt']);
  });

  it('returns at most 250 matching rows', async () => {
    const root = project();
    write(root, 'many.txt', Array.from({ length: 260 }, () => 'todo').join('\n'));

    const rows = await searchText(root, plain);

    expect(rows).toHaveLength(250);
  });

  it('keeps path order and applies the result cap when reads finish out of order', async () => {
    const root = project();
    const paths = Array.from({ length: 260 }, (_, index) => `f${String(index).padStart(3, '0')}.txt`);
    const contents = new Map(paths.map((relativePath) => [relativePath, `todo ${relativePath}`]));
    for (const relativePath of paths) write(root, relativePath, contents.get(relativePath) ?? '');

    const firstRead = Promise.withResolvers<void>();
    const laterReadsComplete = Promise.withResolvers<void>();
    const completed: string[] = [];
    const candidateReader = async (_root: string, relativePath: string) => {
      if (relativePath === paths[0]) await firstRead.promise;
      completed.push(relativePath);
      if (completed.length === 7) laterReadsComplete.resolve();
      return contents.get(relativePath) ?? null;
    };

    const pending = searchText(root, plain, candidateReader);
    await laterReadsComplete.promise;
    expect(completed).toEqual(paths.slice(1, 8));
    firstRead.resolve();

    const rows = await pending;
    expect(rows.map((row) => row.path)).toEqual(paths.slice(0, 250));
  });

  it('returns no rows for an empty query', async () => {
    const root = project();
    write(root, 'a.txt', 'todo');

    await expect(searchText(root, { ...plain, query: '' })).resolves.toEqual([]);
  });
});
