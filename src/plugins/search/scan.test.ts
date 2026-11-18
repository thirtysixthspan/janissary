import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { startScan as runScan, type ScanBatch, type ScanOptions, type ScanQuery } from './scan.js';
import { compileMatcher } from '../../search/compile-matcher.js';
import { fileMatches, matchFile } from '../../search/search-files.js';
import type { MatcherWorker } from '../../search/matcher-worker-protocol.js';

const query: ScanQuery = {
  query: 'todo', include: '', exclude: '', regex: false, matchCase: false, wholeWord: false,
};

const files: Record<string, string> = {
  'a.ts': 'nothing here',
  'b.ts': 'one\ntodo two\nthree',
  'c.ts': 'todo four',
  'd.ts': 'nope',
  'e.ts': 'todo five',
};

const rowsOf = (batches: ScanBatch[]) => batches.flatMap((batch) => batch.rows);
const relOf = (absPath: string) => absPath.replace('/repo/', '');
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

function startScan(options: ScanOptions, request: ScanQuery) {
  return runScan({ ...options, createMatcher: options.createMatcher ?? inlineMatcher }, request);
}

function inlineMatcher(request: ScanQuery): MatcherWorker {
  const matcher = compileMatcher(request.query, request);
  return {
    detect: async (lines) => matcher !== null && fileMatches(lines, matcher),
    rows: async (relPath, text) => matcher === null ? [] : matchFile(relPath, text, matcher),
    dispose: () => {},
  };
}

// Start a scan over an explicit set of file contents, with each file's size derived from those
// contents so no test has to write anything to disk. An absent file is reported as an unreadable
// one, which is what the scan treats a deleted file as.
function scanWith(contents: Record<string, string>, request: Partial<ScanQuery> = {}) {
  const batches: ScanBatch[] = [];
  const readFile = vi.fn(async (absPath: string) => {
    const text = contents[relOf(absPath)];
    if (text === undefined) throw new Error('ENOENT');
    return text;
  });
  startScan({
    listFiles: async () => ({ root: '/repo', paths: Object.keys(contents) }),
    readFile,
    fileSize: async (absPath) => contents[relOf(absPath)]?.length ?? null,
    onBatch: (batch) => { batches.push(batch); },
  }, { ...query, ...request });
  return { batches, readFile };
}

describe('startScan', () => {
  it('streams a row for every matching line in every file', async () => {
    const { batches } = scanWith(files);
    await settle();
    expect(rowsOf(batches).map((row) => [row.path, row.line])).toEqual([
      ['b.ts', 2], ['c.ts', 1], ['e.ts', 1],
    ]);
  });

  it('reports done exactly once, after the last rows', async () => {
    const { batches } = scanWith(files);
    await settle();
    expect(batches.filter((batch) => batch.done)).toHaveLength(1);
    expect(batches.at(-1)?.done).toBe(true);
  });

  it('carries the context around each match', async () => {
    const { batches } = scanWith(files);
    await settle();
    expect(rowsOf(batches)[0]).toEqual({
      path: 'b.ts', line: 2, above: ['one'], match: 'todo two', start: 0, end: 4, below: ['three'],
    });
  });

  it('carries a project-relative path, never an absolute one', async () => {
    const { batches } = scanWith(files);
    await settle();
    expect(rowsOf(batches).every((row) => !row.path.startsWith('/'))).toBe(true);
  });

  it('asks the host for the project file list', async () => {
    const listFiles = vi.fn(async () => ({ root: '/repo', paths: ['b.ts'] }));
    startScan({
      listFiles, readFile: async () => 'todo', fileSize: async () => 4,
      onBatch: () => {},
    }, query);
    await settle();
    expect(listFiles).toHaveBeenCalledTimes(1);
  });

  it('narrows the list by the include field', async () => {
    const { batches } = scanWith({ 'a.ts': 'x', 'b.ts': 'todo', 'c.ts': 'todo' }, { include: 'b.ts' });
    await settle();
    expect(rowsOf(batches).map((row) => row.path)).toEqual(['b.ts']);
  });

  it('honours the exclude field', async () => {
    const { batches } = scanWith(files, { exclude: 'b.ts' });
    await settle();
    expect(rowsOf(batches).map((row) => row.path)).toEqual(['c.ts', 'e.ts']);
  });

  it('skips a file that no longer exists', async () => {
    const { batches } = scanWith({ 'b.ts': 'todo' }, { include: 'gone.ts' });
    const { batches: both } = scanWith({ 'a.ts': 'x', 'b.ts': 'todo' });
    await settle();
    expect(rowsOf(both).map((row) => row.path)).toEqual(['b.ts']);
    expect(rowsOf(batches)).toEqual([]);
  });

  it('skips a file whose bytes look binary', async () => {
    const { batches } = scanWith({ 'bin.dat': 'todo\0binary', 'b.ts': 'todo' });
    await settle();
    expect(rowsOf(batches).map((row) => row.path)).toEqual(['b.ts']);
  });

  it('skips a secret path through the shared reader', async () => {
    const { batches, readFile } = scanWith({ '.env': 'todo secret', 'b.ts': 'todo' });
    await settle();
    expect(rowsOf(batches).map((row) => row.path)).toEqual(['b.ts']);
    expect(readFile.mock.calls.map(([absPath]) => absPath)).not.toContain('/repo/.env');
  });

  it('skips a symlink whose real target is outside the project root', async () => {
    const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'plugin-scan-link-')));
    try {
      const root = path.join(base, 'workspace');
      const outside = path.join(base, 'outside');
      mkdirSync(root);
      mkdirSync(outside);
      writeFileSync(path.join(outside, 'secret.txt'), 'todo secret');
      symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'linked.txt'));
      writeFileSync(path.join(root, 'visible.txt'), 'todo visible');
      const batches: ScanBatch[] = [];
      startScan({
        listFiles: async () => ({ root, paths: ['linked.txt', 'visible.txt'] }),
        onBatch: (batch) => { batches.push(batch); },
      }, query);
      await settle();
      expect(rowsOf(batches).map((row) => row.path)).toEqual(['visible.txt']);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('skips a file over the editor size limit', async () => {
    const batches: ScanBatch[] = [];
    startScan({
      listFiles: async () => ({ root: '/repo', paths: ['big.txt', 'b.ts'] }),
      readFile: async () => 'todo',
      fileSize: async (absPath) => (absPath.endsWith('big.txt') ? 3 * 1024 * 1024 : 4),
      onBatch: (batch) => { batches.push(batch); },
    }, query);
    await settle();
    expect(rowsOf(batches).map((row) => row.path)).toEqual(['b.ts']);
  });

  it('inspects only a prefix for a null byte, so a late one is not treated as binary', async () => {
    // A deliberate ceiling: the refusal costs one prefix read per file, so a file whose null byte
    // sits past it is searched as text rather than skipped.
    const { batches } = scanWith({ 'late.dat': `todo${'.'.repeat(9000)}\0`, 'b.ts': 'todo' });
    await settle();
    expect(rowsOf(batches).map((row) => row.path)).toEqual(['late.dat', 'b.ts']);
  });

  it('settles as done with no rows for a query nothing matches', async () => {
    const { batches } = scanWith({ 'a.ts': 'x', 'd.ts': 'y' }, { query: 'absent' });
    await settle();
    expect(rowsOf(batches)).toEqual([]);
    expect(batches.at(-1)?.done).toBe(true);
  });

  it('settles as done for an empty query without reading anything', async () => {
    const { batches, readFile } = scanWith(files, { query: '' });
    await settle();
    expect(readFile).not.toHaveBeenCalled();
    expect(batches).toEqual([{ rows: [], done: true }]);
  });

  it('settles as done for a regex that will not compile without reading anything', async () => {
    const { batches, readFile } = scanWith(files, { query: '[unclosed', regex: true });
    await settle();
    expect(readFile).not.toHaveBeenCalled();
    expect(batches).toEqual([{ rows: [], done: true }]);
  });

  it('delivers nothing further once cancelled', async () => {
    const batches: ScanBatch[] = [];
    const done = startScan({
      listFiles: async () => ({ root: '/repo', paths: ['b.ts', 'c.ts'] }),
      readFile: async () => 'todo',
      fileSize: async () => 4,
      onBatch: (batch) => { batches.push(batch); },
    }, query);
    done.cancel();
    await settle();
    expect(rowsOf(batches)).toEqual([]);
  });

  it('is safe to cancel before the file list has answered', async () => {
    const readFile = vi.fn();
    const batches: ScanBatch[] = [];
    const done = startScan({
      listFiles: async () => ({ root: '/repo', paths: ['b.ts'] }),
      readFile, fileSize: async () => 4,
      onBatch: (batch) => { batches.push(batch); },
    }, query);
    done.cancel();
    await settle();
    expect(rowsOf(batches)).toEqual([]);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('is safe to cancel twice', async () => {
    const done = startScan({
      listFiles: async () => ({ root: '/repo', paths: [] }),
      readFile: async () => '', fileSize: async () => 0, onBatch: () => {},
    }, query);
    done.cancel();
    expect(() => done.cancel()).not.toThrow();
  });

  it('resolves a file known to match before detecting the next batch', async () => {
    // The property the two-phase design exists for: a file detected in an early batch has its rows
    // delivered before the scan reads the next batch at all, rather than only after the whole
    // repository has been walked in path order. More files than one batch holds, so there is a next
    // batch to be ahead of.
    const contents: Record<string, string> = { 'a-first.ts': 'todo' };
    for (let index = 0; index < 200; index++) contents[`z-late-${String(index).padStart(3, '0')}.ts`] = 'x';
    const delivered: string[] = [];
    let readCountWhenDelivered = -1;
    let reads = 0;
    startScan({
      listFiles: async () => ({ root: '/repo', paths: Object.keys(contents) }),
      readFile: async (absPath) => { reads += 1; return contents[relOf(absPath)]!; },
      fileSize: async (absPath) => contents[relOf(absPath)]?.length ?? null,
      onBatch: (batch) => {
        for (const row of batch.rows) {
          delivered.push(row.path);
          if (readCountWhenDelivered === -1) readCountWhenDelivered = reads;
        }
      },
    }, query);
    await settle();
    expect(delivered).toEqual(['a-first.ts']);
    // The only match resolved after its own batch of 64, well before all 201 files were read.
    expect(readCountWhenDelivered).toBeLessThan(201);
    expect(reads).toBeGreaterThan(readCountWhenDelivered);
  });

  it('streams an early local match while later reads in its batch are pending', async () => {
    const { promise: pending, resolve: releasePending } = Promise.withResolvers<string>();
    const batches: ScanBatch[] = [];
    const readFile = vi.fn(async (absPath: string) =>
      absPath.endsWith('z-late.ts') ? pending : 'todo');
    startScan({
      listFiles: async () => ({ root: '/repo', paths: ['a-first.ts', 'z-late.ts'] }),
      readFile,
      fileSize: async () => 4,
      onBatch: (batch) => { batches.push(batch); },
    }, query);

    try {
      await vi.waitFor(() => expect(rowsOf(batches).map((row) => row.path)).toEqual(['a-first.ts']));
      expect(readFile).toHaveBeenCalledWith('/repo/z-late.ts');
      expect(batches.some((batch) => batch.done)).toBe(false);
    } finally {
      releasePending('nothing');
    }
    await vi.waitFor(() => expect(batches.at(-1)?.done).toBe(true));
  });

  it('publishes remote rows only after the remote scan completes', async () => {
    const batches: ScanBatch[] = [];
    const remoteSearch = vi.fn(async () => [{
      path: 'b.ts', line: 1, above: [], match: 'todo', start: 0, end: 4, below: [],
    }]);
    startScan({
      listFiles: async () => ({ root: '/remote', paths: [] }),
      remoteSearch,
      onBatch: (batch) => { batches.push(batch); },
    }, query);
    await settle();

    expect(remoteSearch).toHaveBeenCalledOnce();
    expect(batches).toEqual([{
      rows: [{ path: 'b.ts', line: 1, above: [], match: 'todo', start: 0, end: 4, below: [] }], done: true,
    }]);
  });

  it('reports a failed file list as a failure rather than a completion', async () => {
    const batches: ScanBatch[] = [];
    startScan({
      listFiles: async () => { throw new Error('git ls-files failed in /repo'); },
      readFile: async () => '', fileSize: async () => 0,
      onBatch: (batch) => { batches.push(batch); },
    }, query);
    await settle();
    // A silent hang reads as "still working", so a failure has to arrive as a failure: distinct from
    // `done`, which means the scan settled having found what it was going to.
    expect(batches).toEqual([{ rows: [], done: false, error: 'git ls-files failed in /repo' }]);
  });

  it('reduces a failure reason to one line with no stack', async () => {
    const batches: ScanBatch[] = [];
    startScan({
      listFiles: async () => { throw new Error('boom\n    at somewhere (file.ts:1:1)'); },
      readFile: async () => '', fileSize: async () => 0,
      onBatch: (batch) => { batches.push(batch); },
    }, query);
    await settle();
    expect(batches[0]?.error).toBe('boom');
  });

  it('reports a non-Error failure as its own text', async () => {
    const batches: ScanBatch[] = [];
    startScan({
      listFiles: async () => { throw 'a bare string reason'; },
      readFile: async () => '', fileSize: async () => 0,
      onBatch: (batch) => { batches.push(batch); },
    }, query);
    await settle();
    expect(batches[0]?.error).toBe('a bare string reason');
  });

  it('reports no failure for a scan the user cancelled', async () => {
    const batches: ScanBatch[] = [];
    const done = startScan({
      listFiles: async () => { throw new Error('too late'); },
      readFile: async () => '', fileSize: async () => 0,
      onBatch: (batch) => { batches.push(batch); },
    }, query);
    done.cancel();
    await settle();
    // A scan the user abandoned is not a failure, so it reports nothing at all.
    expect(batches).toEqual([]);
  });

  it('delivers every match in a file that matches many lines', async () => {
    const { batches } = scanWith({ 'many.ts': 'todo\ntodo\ntodo' });
    await settle();
    expect(rowsOf(batches).map((row) => row.line)).toEqual([1, 2, 3]);
  });

  it('honours a regex query end to end', async () => {
    const { batches } = scanWith({ 'a.ts': 'to+do', 'b.ts': 'todo' }, { query: 'to+do', regex: true });
    await settle();
    expect(rowsOf(batches).map((row) => row.path)).toEqual(['b.ts']);
  });

  it('honours match case end to end', async () => {
    const { batches } = scanWith({ 'a.ts': 'TODO', 'b.ts': 'todo' }, { matchCase: true });
    await settle();
    expect(rowsOf(batches).map((row) => row.path)).toEqual(['b.ts']);
  });

  it('honours whole word end to end', async () => {
    const { batches } = scanWith({ 'a.ts': 'concatenate', 'b.ts': 'the cat sat' }, { query: 'cat', wholeWord: true });
    await settle();
    expect(rowsOf(batches).map((row) => row.path)).toEqual(['b.ts']);
  });

  it('streams across more files than one batch holds, in path order', async () => {
    const many: Record<string, string> = {};
    for (let index = 0; index < 200; index++) many[`f${String(index).padStart(3, '0')}.ts`] = `todo ${index}`;
    const { batches } = scanWith(many);
    await settle();
    const lines = rowsOf(batches).map((row) => row.path);
    expect(lines).toHaveLength(200);
    expect(lines).toEqual(lines.toSorted((a, b) => a.localeCompare(b)));
  });
});

describe('startScan result cap', () => {
  const matchingFiles = (count: number): Record<string, string> => {
    const many: Record<string, string> = {};
    for (let index = 0; index < count; index++) many[`f${String(index).padStart(3, '0')}.ts`] = `todo ${index}`;
    return many;
  };

  it('stops at 250 rows, the first ones in path order, and settles as done once', async () => {
    const { batches } = scanWith(matchingFiles(300));
    await settle();
    const paths = rowsOf(batches).map((row) => row.path);
    expect(paths).toHaveLength(250);
    expect(paths).toEqual(Object.keys(matchingFiles(250)));
    expect(batches.filter((batch) => batch.done)).toHaveLength(1);
    expect(batches.at(-1)).toEqual({ rows: [], done: true });
  });

  it('stops at 250 rows inside one file that matches more lines than that', async () => {
    const { batches } = scanWith({ 'many.ts': Array.from({ length: 300 }, () => 'todo').join('\n') });
    await settle();
    const lines = rowsOf(batches).map((row) => row.line);
    expect(lines).toEqual(Array.from({ length: 250 }, (_, index) => index + 1));
    expect(batches.at(-1)?.done).toBe(true);
  });

  it('takes only the rows that fit from a file straddling the cap', async () => {
    const contents = matchingFiles(248);
    contents['z-last.ts'] = 'todo\ntodo\ntodo\ntodo';
    const { batches } = scanWith(contents);
    await settle();
    const rows = rowsOf(batches);
    expect(rows).toHaveLength(250);
    expect(rows.filter((row) => row.path === 'z-last.ts').map((row) => row.line)).toEqual([1, 2]);
  });

  it('reads no file past the batch that filled the cap', async () => {
    // Batches of 64: the fourth batch (files 192 to 255) fills the cap, so nothing from 256 on is
    // ever read, in either phase.
    const { readFile } = scanWith(matchingFiles(400));
    await settle();
    const read = new Set(readFile.mock.calls.map(([absPath]) => relOf(absPath)));
    expect(read.has('f249.ts')).toBe(true);
    expect(read.has('f256.ts')).toBe(false);
    expect(read.has('f399.ts')).toBe(false);
  });
});
