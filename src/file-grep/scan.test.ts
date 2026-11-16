import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import type * as nodeOs from 'node:os';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as matchingWorkerModule from '../search/matching-worker.js';
import { MatcherDeadlineError } from '../search/matching-worker.js';
import type { SearchMatch } from '../search/types.js';
import type { FileGrepArgs } from './command.js';
import type * as readCandidateModule from './read-candidate.js';
import type { CandidateReader } from './read-candidate.js';
import { GREP_TIMEOUT_MS, grepMatcherModes, scanFiles } from './scan.js';

const mocks = vi.hoisted(() => ({
  createCandidateReader: vi.fn(),
  createMatcherWorker: vi.fn(),
}));

const home = vi.hoisted(() => ({ dir: '' }));

vi.mock('node:os', async (importOriginal) => ({
  ...await importOriginal<typeof nodeOs>(),
  homedir: vi.fn(() => home.dir),
}));

vi.mock('./read-candidate.js', async (importOriginal) => ({
  ...await importOriginal<typeof readCandidateModule>(),
  createCandidateReader: mocks.createCandidateReader,
}));

vi.mock('../search/matching-worker.js', async (importOriginal) => ({
  ...await importOriginal<typeof matchingWorkerModule>(),
  createMatcherWorker: mocks.createMatcherWorker,
}));

type WorkerMock = {
  rows: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

function workerMock(): WorkerMock {
  return { rows: vi.fn(async () => []), dispose: vi.fn() };
}

function args(overrides: Partial<FileGrepArgs> = {}): FileGrepArgs {
  return {
    pattern: 'needle',
    include: '',
    exclude: '',
    literal: false,
    word: false,
    caseSensitive: false,
    limit: 100,
    path: undefined,
    ...overrides,
  };
}

function row(relPath: string, overrides: Partial<SearchMatch> = {}): SearchMatch {
  return {
    path: relPath,
    line: 1,
    above: ['before'],
    match: `  ${relPath} needle`,
    start: 2,
    end: 8,
    below: ['after'],
    ...overrides,
  };
}

function readerFrom(textByPath: Record<string, string | null>): ReturnType<typeof vi.fn> {
  return vi.fn(async (relPath: string) => textByPath[relPath] ?? null);
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

async function run(
  relPaths: readonly string[],
  textByPath: Record<string, string | null>,
  worker: WorkerMock,
  options: { args?: Partial<FileGrepArgs>; deadline?: number } = {},
): Promise<{ result: Awaited<ReturnType<typeof scanFiles>>; reader: ReturnType<typeof vi.fn> }> {
  const reader = readerFrom(textByPath);
  mocks.createCandidateReader.mockResolvedValue(reader);
  mocks.createMatcherWorker.mockReturnValue(worker);
  const deadline = options.deadline ?? Date.now() + 1000;
  const result = await scanFiles('/root', relPaths, args(options.args), deadline);
  return { result, reader };
}

beforeEach(() => {
  mocks.createCandidateReader.mockReset();
  mocks.createMatcherWorker.mockReset();
  home.dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'file-grep-scan-home-')));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  rmSync(home.dir, { recursive: true, force: true });
  home.dir = '';
});

describe('grepMatcherModes', () => {
  it('maps every literal, case and word combination', () => {
    for (const literal of [false, true]) {
      for (const caseSensitive of [false, true]) {
        for (const word of [false, true]) {
          const modes = grepMatcherModes(args({ literal, caseSensitive, word }));
          expect(modes).toEqual({ regex: !literal, matchCase: caseSensitive, wholeWord: word });
          expect(Object.keys(modes)).toEqual(['regex', 'matchCase', 'wholeWord']);
        }
      }
    }
  });

  it('states the timeout budget in milliseconds', () => {
    expect(GREP_TIMEOUT_MS).toBe(30_000);
  });
});

describe('scanFiles scanning', () => {
  it('builds one worker lazily with the pattern, mapped modes and live signal', async () => {
    const worker = workerMock();
    mocks.createCandidateReader.mockResolvedValue(readerFrom({ 'a.txt': null, 'b.txt': 'needle' }));
    mocks.createMatcherWorker.mockReturnValue(worker);
    const result = await scanFiles(
      '/root', ['a.txt', 'b.txt'], args({ pattern: 'n.*', caseSensitive: true, word: true }), Date.now() + 1000,
    );

    expect(result).toEqual({ rows: [], ending: undefined });
    expect(Object.keys(result)).toEqual(['rows', 'ending']);
    expect(mocks.createCandidateReader).toHaveBeenCalledOnce();
    expect(mocks.createMatcherWorker).toHaveBeenCalledOnce();
    const [query, modes, signal] = mocks.createMatcherWorker.mock.calls[0] as [string, unknown, AbortSignal];
    expect(query).toBe('n.*');
    expect(modes).toEqual({ regex: true, matchCase: true, wholeWord: true });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
    expect(worker.dispose).toHaveBeenCalledOnce();
  });

  it('scans supplied paths in order and preserves worker rows unchanged', async () => {
    const zed = row('z.txt', { line: 7, match: '  needle z', start: 2, end: 8 });
    const alpha = row('a.txt', { line: 2, match: 'needle a', start: 0, end: 6 });
    const middle = row('m.txt', { line: 4, above: [], below: ['tail'] });
    const worker = workerMock();
    const rowsByPath: Record<string, SearchMatch[]> = { 'z.txt': [zed], 'a.txt': [alpha], 'm.txt': [middle] };
    worker.rows.mockImplementation(async (relPath: string) => rowsByPath[relPath] ?? []);
    const { result, reader } = await run(
      ['z.txt', 'a.txt', 'm.txt'], { 'z.txt': 'z', 'a.txt': 'a', 'm.txt': 'm' }, worker,
    );

    expect(reader.mock.calls.map(([relPath]) => relPath)).toEqual(['z.txt', 'a.txt', 'm.txt']);
    expect(worker.rows.mock.calls.map(([relPath]) => relPath)).toEqual(['z.txt', 'a.txt', 'm.txt']);
    expect(result.rows).toEqual([zed, alpha, middle]);
    expect(result.rows[0]).toBe(zed);
    expect(result.rows[1]).toBe(alpha);
    expect(result.rows[2]).toBe(middle);
  });

  it('skips null candidates between successful reads and forwards an empty string to matching', async () => {
    const worker = workerMock();
    const rowsByPath: Record<string, SearchMatch[]> = {
      'a.txt': [row('a.txt')],
      'c.txt': [row('c.txt', { match: '', start: 0, end: 0 })],
      'd.txt': [row('d.txt')],
    };
    worker.rows.mockImplementation(async (relPath: string) => rowsByPath[relPath] ?? []);
    const { result } = await run(
      ['a.txt', 'b.txt', 'c.txt', 'd.txt'],
      { 'a.txt': 'a text', 'b.txt': null, 'c.txt': '', 'd.txt': 'd text' },
      worker,
    );

    expect(worker.rows.mock.calls.map(([relPath, text]) => [relPath, text])).toEqual([
      ['a.txt', 'a text'], ['c.txt', ''], ['d.txt', 'd text'],
    ]);
    expect(result.rows.map((entry) => entry.path)).toEqual(['a.txt', 'c.txt', 'd.txt']);
    expect(result.ending).toBeUndefined();
  });

  it('completes empty input without creating a reader or worker', async () => {
    const result = await scanFiles('/root', [], args(), Date.now() - 1);
    expect(result).toEqual({ rows: [], ending: undefined });
    expect(mocks.createCandidateReader).not.toHaveBeenCalled();
    expect(mocks.createMatcherWorker).not.toHaveBeenCalled();
  });

  it('creates no worker when every candidate is skipped', async () => {
    const worker = workerMock();
    const { result, reader } = await run(['a.txt', 'b.txt'], {}, worker);

    expect(reader.mock.calls).toHaveLength(2);
    expect(mocks.createMatcherWorker).not.toHaveBeenCalled();
    expect(worker.dispose).not.toHaveBeenCalled();
    expect(result).toEqual({ rows: [], ending: undefined });
  });

  it('awaits one reader at a time and starts no next read before matching settles', async () => {
    const firstRead = Promise.withResolvers<string | null>();
    const firstMatch = Promise.withResolvers<SearchMatch[]>();
    const reader = vi.fn((relPath: string) => relPath === 'a.txt' ? firstRead.promise : Promise.resolve('second'));
    const worker = workerMock();
    worker.rows.mockReturnValueOnce(firstMatch.promise).mockResolvedValue([]);
    mocks.createCandidateReader.mockResolvedValue(reader);
    mocks.createMatcherWorker.mockReturnValue(worker);
    const scanning = scanFiles('/root', ['a.txt', 'b.txt'], args(), Date.now() + 1000);

    await nextTask();
    expect(reader).toHaveBeenCalledTimes(1);
    expect(mocks.createMatcherWorker).not.toHaveBeenCalled();

    firstRead.resolve('first');
    await nextTask();
    expect(mocks.createMatcherWorker).toHaveBeenCalledTimes(1);
    expect(worker.rows).toHaveBeenCalledTimes(1);
    expect(reader).toHaveBeenCalledTimes(1);

    firstMatch.resolve([]);
    await expect(scanning).resolves.toEqual({ rows: [], ending: undefined });
    expect(reader.mock.calls.map(([relPath]) => relPath)).toEqual(['a.txt', 'b.txt']);
    expect(mocks.createMatcherWorker).toHaveBeenCalledOnce();
    expect(worker.dispose).toHaveBeenCalledOnce();
  });
});

describe('scanFiles limits', () => {
  it('retains only the limit plus one sentinel from a large single-file batch', async () => {
    const worker = workerMock();
    const batch = Array.from({ length: 10 }, (_value, index) => row('a.txt', { line: index + 1 }));
    worker.rows.mockResolvedValue(batch);
    const { result, reader } = await run(
      ['a.txt', 'b.txt'], { 'a.txt': 'a', 'b.txt': 'b' }, worker, { args: { limit: 2 } },
    );

    expect(result.rows).toEqual(batch.slice(0, 2));
    expect(result.ending).toEqual({ kind: 'limit', limit: 2 });
    expect(reader).toHaveBeenCalledOnce();
    expect(worker.rows).toHaveBeenCalledOnce();
    expect(worker.dispose).toHaveBeenCalledOnce();
  });

  it('returns the limit ending when the sentinel arrives across files', async () => {
    const only = row('a.txt');
    const second = row('b.txt');
    const worker = workerMock();
    worker.rows.mockImplementation(async (relPath: string) => relPath === 'a.txt' ? [only] : [second]);
    const { result, reader } = await run(
      ['a.txt', 'b.txt', 'c.txt'], { 'a.txt': 'a', 'b.txt': 'b', 'c.txt': 'c' }, worker, { args: { limit: 1 } },
    );

    expect(result.rows).toEqual([only]);
    expect(result.ending).toEqual({ kind: 'limit', limit: 1 });
    expect(reader.mock.calls.map(([relPath]) => relPath)).toEqual(['a.txt', 'b.txt']);
    expect(worker.rows).toHaveBeenCalledTimes(2);
  });

  it('returns an undefined ending when fewer than the limit are found', async () => {
    const single = row('a.txt');
    const worker = workerMock();
    worker.rows.mockImplementation(async (relPath: string) => relPath === 'a.txt' ? [single] : []);
    const { result, reader } = await run(
      ['a.txt', 'b.txt', 'c.txt'], { 'a.txt': 'a', 'b.txt': 'b', 'c.txt': null }, worker, { args: { limit: 3 } },
    );

    expect(result.rows).toEqual([single]);
    expect(result.ending).toBeUndefined();
    expect(reader).toHaveBeenCalledTimes(3);
  });

  it('continues after exactly the limit and finds a later sentinel', async () => {
    const first = row('a.txt', { line: 1 });
    const second = row('a.txt', { line: 2 });
    const later = row('b.txt');
    const worker = workerMock();
    worker.rows.mockImplementation(async (relPath: string) => relPath === 'a.txt' ? [first, second] : [later]);
    const { result, reader } = await run(
      ['a.txt', 'b.txt', 'c.txt'], { 'a.txt': 'a', 'b.txt': 'b', 'c.txt': 'c' }, worker, { args: { limit: 2 } },
    );

    expect(result.rows).toEqual([first, second]);
    expect(result.ending).toEqual({ kind: 'limit', limit: 2 });
    expect(reader.mock.calls.map(([relPath]) => relPath)).toEqual(['a.txt', 'b.txt']);
    expect(worker.rows).toHaveBeenCalledTimes(2);
  });

  it('exhausts remaining candidates after exactly the limit without a sentinel', async () => {
    const first = row('a.txt', { line: 1 });
    const second = row('a.txt', { line: 2 });
    const worker = workerMock();
    worker.rows.mockImplementation(async (relPath: string) => relPath === 'a.txt' ? [first, second] : []);
    const { result, reader } = await run(
      ['a.txt', 'b.txt', 'c.txt'], { 'a.txt': 'a', 'b.txt': null, 'c.txt': 'c' }, worker, { args: { limit: 2 } },
    );

    expect(result.rows).toEqual([first, second]);
    expect(result.ending).toBeUndefined();
    expect(reader).toHaveBeenCalledTimes(3);
    expect(worker.rows).toHaveBeenCalledTimes(2);
  });
});

describe('scanFiles deadlines', () => {
  it('returns timeout before setup for an expired deadline and one exactly at the current time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    for (const deadline of [999, 1000]) {
      await expect(scanFiles('/root', ['a.txt'], args(), deadline))
        .resolves.toEqual({ rows: [], ending: { kind: 'timeout' } });
    }
    expect(mocks.createCandidateReader).not.toHaveBeenCalled();
    expect(mocks.createMatcherWorker).not.toHaveBeenCalled();
  });

  it('times out a reader factory that never settles and aborts its signal', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const factory = Promise.withResolvers<CandidateReader>();
    let signal: AbortSignal | undefined;
    mocks.createCandidateReader.mockImplementation((_root: string, captured: AbortSignal) => {
      signal = captured;
      return factory.promise;
    });
    const scanning = scanFiles('/root', ['a.txt'], args(), 1100);

    await vi.advanceTimersByTimeAsync(100);
    await expect(scanning).resolves.toEqual({ rows: [], ending: { kind: 'timeout' } });
    expect(signal?.aborted).toBe(true);

    const reader = readerFrom({ 'a.txt': 'late' });
    factory.resolve(reader);
    await vi.advanceTimersByTimeAsync(100);
    expect(reader).not.toHaveBeenCalled();
    expect(mocks.createMatcherWorker).not.toHaveBeenCalled();
  });

  it('keeps the timeout ending when abort makes the losing read reject', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    mocks.createCandidateReader.mockImplementation((_root: string, signal: AbortSignal) => Promise.resolve(
      () => new Promise<string | null>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('read cancelled')), { once: true });
      }),
    ));
    const scanning = scanFiles('/root', ['a.txt'], args(), 1100);

    await vi.advanceTimersByTimeAsync(100);
    await expect(scanning).resolves.toEqual({ rows: [], ending: { kind: 'timeout' } });
    await vi.advanceTimersByTimeAsync(0);
    await expect(scanning).resolves.toEqual({ rows: [], ending: { kind: 'timeout' } });
  });

  it('times out a read that never settles before any match and ignores late text', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const read = Promise.withResolvers<string | null>();
    mocks.createCandidateReader.mockResolvedValue(vi.fn(() => read.promise));
    const scanning = scanFiles('/root', ['a.txt'], args(), 1100);

    await vi.advanceTimersByTimeAsync(100);
    await expect(scanning).resolves.toEqual({ rows: [], ending: { kind: 'timeout' } });

    read.resolve('late text');
    await vi.advanceTimersByTimeAsync(100);
    expect(mocks.createMatcherWorker).not.toHaveBeenCalled();
  });

  it('keeps earlier rows when a later read times out and starts no later candidate', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const later = Promise.withResolvers<string | null>();
    const first = row('a.txt');
    const worker = workerMock();
    worker.rows.mockResolvedValue([first]);
    mocks.createMatcherWorker.mockReturnValue(worker);
    const reader = vi.fn((relPath: string) => relPath === 'a.txt' ? Promise.resolve('a') : later.promise);
    mocks.createCandidateReader.mockResolvedValue(reader);
    const scanning = scanFiles('/root', ['a.txt', 'b.txt', 'c.txt'], args(), 1100);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    await expect(scanning).resolves.toEqual({ rows: [first], ending: { kind: 'timeout' } });

    later.resolve('late');
    await vi.advanceTimersByTimeAsync(100);
    expect(reader).toHaveBeenCalledTimes(2);
    expect(worker.rows).toHaveBeenCalledOnce();
    expect(worker.dispose).toHaveBeenCalledOnce();
  });

  it('checks the deadline before starting a later read', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const match = Promise.withResolvers<SearchMatch[]>();
    const worker = workerMock();
    worker.rows.mockReturnValue(match.promise);
    mocks.createMatcherWorker.mockReturnValue(worker);
    const reader = vi.fn(async (relPath: string) => `${relPath} text`);
    mocks.createCandidateReader.mockResolvedValue(reader);
    const first = row('a.txt');
    const scanning = scanFiles('/root', ['a.txt', 'b.txt'], args(), 1100);

    await vi.advanceTimersByTimeAsync(0);
    expect(worker.rows).toHaveBeenCalledOnce();
    vi.setSystemTime(1100);
    match.resolve([first]);
    await expect(scanning).resolves.toEqual({ rows: [first], ending: { kind: 'timeout' } });
    expect(reader).toHaveBeenCalledOnce();
  });

  it('returns timeout when the overall timer fires during matching and discards a late batch', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const batch = Promise.withResolvers<SearchMatch[]>();
    const worker = workerMock();
    worker.rows.mockReturnValue(batch.promise);
    mocks.createMatcherWorker.mockReturnValue(worker);
    const reader = readerFrom({ 'a.txt': 'a', 'b.txt': 'b' });
    mocks.createCandidateReader.mockResolvedValue(reader);
    const scanning = scanFiles('/root', ['a.txt', 'b.txt'], args(), 1100);

    await vi.advanceTimersByTimeAsync(100);
    await expect(scanning).resolves.toEqual({ rows: [], ending: { kind: 'timeout' } });

    const workerSignal = mocks.createMatcherWorker.mock.calls[0]?.[2] as AbortSignal;
    expect(workerSignal.aborted).toBe(true);

    batch.resolve([row('a.txt')]);
    await vi.advanceTimersByTimeAsync(100);
    expect(reader).toHaveBeenCalledOnce();
    expect(worker.dispose).toHaveBeenCalledOnce();
  });

  it('returns the limit ending when a sentinel completes before the deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const worker = workerMock();
    const batch = [row('a.txt', { line: 1 }), row('a.txt', { line: 2 })];
    worker.rows.mockResolvedValue(batch);
    const { result } = await run(['a.txt'], { 'a.txt': 'a' }, worker, { args: { limit: 1 }, deadline: 1100 });

    expect(result.rows).toEqual([batch[0]]);
    expect(result.ending).toEqual({ kind: 'limit', limit: 1 });
  });

  it('returns timeout while seeking a sentinel after exactly the limit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const later = Promise.withResolvers<string | null>();
    const first = row('a.txt');
    const worker = workerMock();
    worker.rows.mockResolvedValue([first]);
    mocks.createMatcherWorker.mockReturnValue(worker);
    const reader = vi.fn((relPath: string) => relPath === 'a.txt' ? Promise.resolve('a') : later.promise);
    mocks.createCandidateReader.mockResolvedValue(reader);
    const scanning = scanFiles('/root', ['a.txt', 'b.txt'], args({ limit: 1 }), 1100);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    await expect(scanning).resolves.toEqual({ rows: [first], ending: { kind: 'timeout' } });
    expect(reader).toHaveBeenCalledTimes(2);
    expect(worker.dispose).toHaveBeenCalledOnce();
  });
});

describe('scanFiles slow matching', () => {
  it('returns the slow ending for a typed rejection on the first file', async () => {
    const worker = workerMock();
    worker.rows.mockRejectedValue(new MatcherDeadlineError('Search matching exceeded its 1000 ms deadline'));
    const { result, reader } = await run(['a.txt', 'b.txt'], { 'a.txt': 'a', 'b.txt': 'b' }, worker);

    expect(result).toEqual({ rows: [], ending: { kind: 'slow', path: 'a.txt' } });
    expect(reader).toHaveBeenCalledOnce();
    expect(worker.dispose).toHaveBeenCalledOnce();
  });

  it('keeps earlier rows for a typed rejection on a later file', async () => {
    const first = row('a.txt');
    const worker = workerMock();
    worker.rows.mockResolvedValueOnce([first])
      .mockRejectedValueOnce(new MatcherDeadlineError('Search matching exceeded its 1000 ms deadline'));
    const { result, reader } = await run(['a.txt', 'b.txt', 'c.txt'], { 'a.txt': 'a', 'b.txt': 'b', 'c.txt': 'c' }, worker);

    expect(result).toEqual({ rows: [first], ending: { kind: 'slow', path: 'b.txt' } });
    expect(reader.mock.calls.map(([relPath]) => relPath)).toEqual(['a.txt', 'b.txt']);
    expect(worker.dispose).toHaveBeenCalledOnce();
  });

  it('keeps the timeout ending when the overall timer wins before a typed rejection', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const pending = Promise.withResolvers<SearchMatch[]>();
    const worker = workerMock();
    worker.rows.mockReturnValue(pending.promise);
    mocks.createMatcherWorker.mockReturnValue(worker);
    mocks.createCandidateReader.mockResolvedValue(readerFrom({ 'a.txt': 'a' }));
    const scanning = scanFiles('/root', ['a.txt'], args(), 1100);

    await vi.advanceTimersByTimeAsync(100);
    await expect(scanning).resolves.toEqual({ rows: [], ending: { kind: 'timeout' } });

    pending.reject(new MatcherDeadlineError('Search matching exceeded its 1000 ms deadline'));
    await vi.advanceTimersByTimeAsync(100);
    await expect(scanning).resolves.toEqual({ rows: [], ending: { kind: 'timeout' } });
    expect(worker.dispose).toHaveBeenCalledOnce();
  });

  it('rejects an ordinary deadline-like error unchanged before timeout', async () => {
    const failure = new Error('Search matching exceeded its 1000 ms deadline');
    const worker = workerMock();
    worker.rows.mockRejectedValue(failure);
    mocks.createMatcherWorker.mockReturnValue(worker);
    mocks.createCandidateReader.mockResolvedValue(readerFrom({ 'a.txt': 'a' }));

    await expect(scanFiles('/root', ['a.txt'], args(), Date.now() + 1000)).rejects.toBe(failure);
    expect(worker.dispose).toHaveBeenCalledOnce();
  });
});

describe('scanFiles unexpected failures', () => {
  it('propagates a reader factory rejection', async () => {
    const failure = new Error('factory failed');
    mocks.createCandidateReader.mockRejectedValue(failure);

    await expect(scanFiles('/root', ['a.txt'], args(), Date.now() + 1000)).rejects.toBe(failure);
    expect(mocks.createMatcherWorker).not.toHaveBeenCalled();
  });

  it('propagates a reader rejection', async () => {
    const failure = new Error('reader failed');
    mocks.createCandidateReader.mockResolvedValue(vi.fn().mockRejectedValue(failure));

    await expect(scanFiles('/root', ['a.txt'], args(), Date.now() + 1000)).rejects.toBe(failure);
    expect(mocks.createMatcherWorker).not.toHaveBeenCalled();
  });

  it('propagates a worker construction rejection without disposing a worker', async () => {
    const failure = new Error('worker failed to start');
    mocks.createCandidateReader.mockResolvedValue(readerFrom({ 'a.txt': 'a' }));
    mocks.createMatcherWorker.mockImplementation(() => {
      throw failure;
    });

    await expect(scanFiles('/root', ['a.txt'], args(), Date.now() + 1000)).rejects.toBe(failure);
    expect(mocks.createMatcherWorker).toHaveBeenCalledOnce();
  });
});

describe('scanFiles with the real matcher worker', () => {
  it('reports a slow file after earlier rows while the parent stays responsive', async () => {
    const actualReader = await vi.importActual<typeof readCandidateModule>('./read-candidate.js');
    const actualWorker = await vi.importActual<typeof matchingWorkerModule>('../search/matching-worker.js');
    mocks.createCandidateReader.mockImplementation(actualReader.createCandidateReader);
    mocks.createMatcherWorker.mockImplementation(actualWorker.createMatcherWorker);
    const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'file-grep-scan-real-')));
    const root = path.join(base, 'workspace');
    mkdirSync(root);
    writeFileSync(path.join(root, 'first.txt'), 'aaaa\n');
    writeFileSync(path.join(root, 'second.txt'), `${'a'.repeat(40)}b\n`);
    let parentTimerRan = false;
    const timer = setTimeout(() => {
      parentTimerRan = true;
    }, 10);
    try {
      const result = await scanFiles(
        root, ['first.txt', 'second.txt'], args({ pattern: '(a+)+$' }), Date.now() + GREP_TIMEOUT_MS,
      );
      expect(parentTimerRan).toBe(true);
      expect(result.rows.map((entry) => entry.path)).toEqual(['first.txt']);
      expect(result.ending).toEqual({ kind: 'slow', path: 'second.txt' });
    } finally {
      clearTimeout(timer);
      rmSync(base, { recursive: true, force: true });
    }
  }, 10_000);
});
