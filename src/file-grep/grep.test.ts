import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import type * as fileSystemPromises from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import type * as nodeOs from 'node:os';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import type * as workerThreads from 'node:worker_threads';
import type { Worker } from 'node:worker_threads';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as searchModule from '../file-navigator/search.js';
import { listProjectFiles } from '../file-navigator/search.js';
import type * as compileMatcherModule from '../search/compile-matcher.js';
import type { MatcherModes } from '../search/compile-matcher.js';
import { compileMatcher, patternError } from '../search/compile-matcher.js';
import type * as matchingWorkerModule from '../search/matching-worker.js';
import { createMatcherWorker, MatcherDeadlineError } from '../search/matching-worker.js';
import type { MatcherWorker } from '../search/matcher-worker-protocol.js';
import type { SearchMatch } from '../search/types.js';
import { SEARCH_MAX_FILE_BYTES } from '../search/types.js';
import type * as candidatesModule from './candidates.js';
import { discoverGrepCandidates } from './candidates.js';
import type { FileGrepArgs } from './command.js';
import { FILE_GREP_USAGE } from './command.js';
import type * as deadlineModule from './deadline.js';
import { withDeadline } from './deadline.js';
import type * as formatModule from './format.js';
import { formatGrepResult } from './format.js';
import { grepWorkspace, grepWorkspaceCommand } from './grep.js';
import type * as pathTargetModule from './path-target.js';
import type { GrepSearchTarget, ResolvedGrepTarget } from './path-target.js';
import { resolveGrepTarget } from './path-target.js';
import type * as readCandidateModule from './read-candidate.js';
import { createCandidateReader } from './read-candidate.js';
import type * as scanModule from './scan.js';
import { GREP_TIMEOUT_MS, grepMatcherModes, scanFiles } from './scan.js';

type WorkerFactory = (url: URL, options: workerThreads.WorkerOptions) => unknown | undefined;
type WorkerEntry = { url: URL; worker: unknown };

const home = vi.hoisted(() => ({ dir: '' }));

const compile = vi.hoisted(() => ({
  matchers: [] as Array<{ test: ReturnType<typeof vi.fn>; locate: ReturnType<typeof vi.fn> }>,
}));

const workerControl = vi.hoisted(() => ({
  factory: null as WorkerFactory | null,
  onCreate: null as ((entry: WorkerEntry) => void) | null,
  entries: [] as WorkerEntry[],
}));

vi.mock('node:os', async (importOriginal) => ({
  ...await importOriginal<typeof nodeOs>(),
  homedir: vi.fn(() => home.dir),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fileSystemPromises>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

vi.mock('../file-navigator/search.js', async (importOriginal) => {
  const actual = await importOriginal<typeof searchModule>();
  return { listProjectFiles: vi.fn(actual.listProjectFiles) };
});

vi.mock('../search/compile-matcher.js', async (importOriginal) => {
  const actual = await importOriginal<typeof compileMatcherModule>();
  return {
    ...actual,
    compileMatcher: vi.fn((query: string, modes: MatcherModes) => {
      const matcher = actual.compileMatcher(query, modes);
      if (matcher === null) return null;
      const recording = { test: vi.fn(matcher.test), locate: vi.fn(matcher.locate) };
      compile.matchers.push(recording);
      return recording;
    }),
    patternError: vi.fn(actual.patternError),
  };
});

vi.mock('../search/matching-worker.js', async (importOriginal) => {
  const actual = await importOriginal<typeof matchingWorkerModule>();
  return { ...actual, createMatcherWorker: vi.fn(actual.createMatcherWorker) };
});

vi.mock('./candidates.js', async (importOriginal) => {
  const actual = await importOriginal<typeof candidatesModule>();
  return { ...actual, discoverGrepCandidates: vi.fn(actual.discoverGrepCandidates) };
});

vi.mock('./deadline.js', async (importOriginal) => {
  const actual = await importOriginal<typeof deadlineModule>();
  return { ...actual, withDeadline: vi.fn(actual.withDeadline) };
});

vi.mock('./format.js', async (importOriginal) => {
  const actual = await importOriginal<typeof formatModule>();
  return { ...actual, formatGrepResult: vi.fn(actual.formatGrepResult) };
});

vi.mock('./path-target.js', async (importOriginal) => {
  const actual = await importOriginal<typeof pathTargetModule>();
  return { ...actual, resolveGrepTarget: vi.fn(actual.resolveGrepTarget) };
});

vi.mock('./read-candidate.js', async (importOriginal) => {
  const actual = await importOriginal<typeof readCandidateModule>();
  return { ...actual, createCandidateReader: vi.fn(actual.createCandidateReader) };
});

vi.mock('./scan.js', async (importOriginal) => {
  const actual = await importOriginal<typeof scanModule>();
  return {
    ...actual,
    grepMatcherModes: vi.fn(actual.grepMatcherModes),
    scanFiles: vi.fn(actual.scanFiles),
  };
});

vi.mock('node:worker_threads', async (importOriginal) => {
  const actual = await importOriginal<typeof workerThreads>();
  const WorkerMock = vi.fn(function (url: URL, options: workerThreads.WorkerOptions) {
    const worker = workerControl.factory?.(url, options) ?? new actual.Worker(url, options);
    const entry = { url, worker };
    workerControl.entries.push(entry);
    workerControl.onCreate?.(entry);
    return worker;
  });
  return { ...actual, Worker: WorkerMock };
});

const actualSearch = await vi.importActual<typeof searchModule>('../file-navigator/search.js');
const actualCompile = await vi.importActual<typeof compileMatcherModule>('../search/compile-matcher.js');
const actualMatching = await vi.importActual<typeof matchingWorkerModule>('../search/matching-worker.js');
const actualCandidates = await vi.importActual<typeof candidatesModule>('./candidates.js');
const actualDeadline = await vi.importActual<typeof deadlineModule>('./deadline.js');
const actualFormat = await vi.importActual<typeof formatModule>('./format.js');
const actualPathTarget = await vi.importActual<typeof pathTargetModule>('./path-target.js');
const actualReader = await vi.importActual<typeof readCandidateModule>('./read-candidate.js');
const actualScan = await vi.importActual<typeof scanModule>('./scan.js');
const actualFs = await vi.importActual<typeof fileSystemPromises>('node:fs/promises');

const NO_MATCHES = '(no matches)';
const TIMEOUT_LINE = '(search stopped after 30 seconds; narrow the pattern or --path)';
const TIMEOUT_RESULT = `${NO_MATCHES}\n${TIMEOUT_LINE}`;
const LITERAL_HINT = 'Use --literal to search for the text as typed.';

const savedEnv = { GIT_DIR: process.env.GIT_DIR, GIT_INDEX_FILE: process.env.GIT_INDEX_FILE };

let base: string;
let homeDirectory: string;
let root: string;
let discoverySignals: AbortSignal[];
let discoveryAborts: number;
let discoveryRejections: unknown[];

type WorkerTermination = { mock: { calls: unknown[][] } } & Worker['terminate'];

function watchTermination(worker: Worker): WorkerTermination {
  return vi.spyOn(worker, 'terminate') as unknown as WorkerTermination;
}

function isFilterEntry(entry: WorkerEntry): boolean {
  return entry.url.pathname.endsWith('/file-grep/filter-worker-entry.ts');
}

function filterEntries(): WorkerEntry[] {
  return workerControl.entries.filter((entry) => isFilterEntry(entry));
}

function restoreEnv(): void {
  const entries = Object.entries(savedEnv);
  for (const [key, value] of entries) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => {
  base = realpathSync(mkdtempSync(path.join(tmpdir(), 'file-grep-entry-')));
  homeDirectory = path.join(base, 'home');
  root = path.join(base, 'workspace');
  mkdirSync(homeDirectory);
  mkdirSync(root);
  home.dir = homeDirectory;
  discoverySignals = [];
  discoveryAborts = 0;
  discoveryRejections = [];
  compile.matchers = [];
  workerControl.factory = null;
  workerControl.onCreate = null;
  workerControl.entries = [];

  vi.mocked(listProjectFiles).mockReset().mockImplementation(actualSearch.listProjectFiles);
  vi.mocked(readFile).mockReset().mockImplementation(actualFs.readFile as typeof readFile);
  vi.mocked(compileMatcher).mockReset().mockImplementation((query, modes) => {
    const matcher = actualCompile.compileMatcher(query, modes);
    if (matcher === null) return null;
    const recording = { test: vi.fn(matcher.test), locate: vi.fn(matcher.locate) };
    compile.matchers.push(recording);
    return recording;
  });
  vi.mocked(patternError).mockReset().mockImplementation(actualCompile.patternError);
  vi.mocked(createMatcherWorker).mockReset().mockImplementation(actualMatching.createMatcherWorker);
  vi.mocked(createCandidateReader).mockReset().mockImplementation(actualReader.createCandidateReader);
  vi.mocked(resolveGrepTarget).mockReset().mockImplementation(actualPathTarget.resolveGrepTarget);
  vi.mocked(scanFiles).mockReset().mockImplementation(actualScan.scanFiles);
  vi.mocked(grepMatcherModes).mockReset().mockImplementation(actualScan.grepMatcherModes);
  vi.mocked(withDeadline).mockReset().mockImplementation(actualDeadline.withDeadline);
  vi.mocked(formatGrepResult).mockReset().mockImplementation(actualFormat.formatGrepResult);
  vi.mocked(discoverGrepCandidates).mockReset().mockImplementation(async (target, include, exclude, signal) => {
    discoverySignals.push(signal);
    signal.addEventListener('abort', () => {
      discoveryAborts += 1;
    });
    try {
      return await actualCandidates.discoverGrepCandidates(target, include, exclude, signal);
    } catch (error) {
      discoveryRejections.push(error);
      throw error;
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnv();
  vi.clearAllMocks();
  rmSync(base, { recursive: true, force: true });
});

function write(relative: string, content: string | Buffer = 'text\n'): string {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
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

function grep(overrides: Partial<FileGrepArgs> = {}, deadline = Date.now() + 5000, targetRoot = root): Promise<string> {
  return grepWorkspace(targetRoot, args(overrides), deadline);
}

function directoryTarget(): GrepSearchTarget {
  return { kind: 'directory', root, prefix: '', searchDir: root };
}

function row(relPath: string, line = 1, match = 'needle', start = 0, end = 6): SearchMatch {
  return { path: relPath, line, above: [], match, start, end, below: [] };
}

function workerMock(): MatcherWorker {
  return { detect: vi.fn(async () => true), rows: vi.fn(async () => []), dispose: vi.fn() };
}

function git(gitArgs: string[], env: NodeJS.ProcessEnv = process.env): string {
  return execFileSync('git', gitArgs, { cwd: root, env, encoding: 'utf8' });
}

function initRepo(): void {
  git(['init', '-q']);
  git(['config', 'user.email', 'test@test.com']);
  git(['config', 'user.name', 'test']);
}

function commitAll(): void {
  git(['add', '-A']);
  git(['commit', '-qm', 'snapshot']);
}

function regexMessage(pattern: string): string {
  try {
    new RegExp(pattern, 'i');
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`Expected ${pattern} to be an invalid regular expression`);
}

function expectNoWorkspaceWork(): void {
  expect(vi.mocked(resolveGrepTarget)).not.toHaveBeenCalled();
  expect(vi.mocked(homedir)).not.toHaveBeenCalled();
  expect(vi.mocked(listProjectFiles)).not.toHaveBeenCalled();
  expect(vi.mocked(createCandidateReader)).not.toHaveBeenCalled();
  expect(vi.mocked(createMatcherWorker)).not.toHaveBeenCalled();
  expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  expect(vi.mocked(withDeadline)).not.toHaveBeenCalled();
}

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitFor(predicate: () => boolean, timeout = 3000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error('Timed out waiting for condition');
    await sleep(10);
  }
}

type Listener = (value: unknown) => void;

class FakeWorker {
  private readonly listeners = new Map<string, Listener[]>();
  termination: Promise<number> = Promise.resolve(0);
  readonly terminate = vi.fn(() => this.termination);

  on(event: string, listener: Listener): this {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener: Listener): this {
    const listeners = this.listeners.get(event) ?? [];
    this.listeners.set(event, listeners.filter((entry) => entry !== listener));
    return this;
  }

  fail(error: Error): void {
    const listeners = this.listeners.get('error') ?? [];
    for (const listener of listeners) listener(error);
  }

  listenerCount(event: string): number {
    return (this.listeners.get(event) ?? []).length;
  }
}

describe('mode combinations', () => {
  const combinations = [false, true].flatMap((literal) => [false, true].flatMap((caseSensitive) => [false, true].map((word) => [literal, caseSensitive, word] as const)));

  function expected(caseSensitive: boolean, word: boolean): string {
    const lines: string[] = [];
    if (!caseSensitive) lines.push('modes.txt:1: Needle');
    if (!word) lines.push('modes.txt:2: needleword');
    if (!caseSensitive) lines.push('modes.txt:3: NEEDLE');
    return lines.length === 0 ? NO_MATCHES : lines.join('\n');
  }

  it.each(combinations)('literal %s, case-sensitive %s, whole-word %s', async (literal, caseSensitive, word) => {
    write('modes.txt', 'Needle\nneedleword\nNEEDLE\n');
    const result = await grep({ literal, caseSensitive, word });

    expect(result).toBe(expected(caseSensitive, word));
    expect(vi.mocked(grepMatcherModes)).toHaveBeenCalledOnce();
    expect(vi.mocked(grepMatcherModes).mock.calls[0]?.[0]).toMatchObject({ literal, caseSensitive, word });
    expect(vi.mocked(createMatcherWorker)).toHaveBeenCalledOnce();
    expect(vi.mocked(createMatcherWorker).mock.calls[0]?.[1])
      .toEqual({ regex: !literal, matchCase: caseSensitive, wholeWord: word });
    expect(compile.matchers).toHaveLength(1);
    expect(compile.matchers[0]?.test).not.toHaveBeenCalled();
    expect(compile.matchers[0]?.locate).not.toHaveBeenCalled();
  });
});

describe('validation', () => {
  it('reports a malformed regular expression with the literal hint', async () => {
    write('a.txt', 'text\n');
    const message = regexMessage('[unclosed');
    expect(await grep({ pattern: '[unclosed' })).toBe(`${message}\n${LITERAL_HINT}`);
    expect(message).toContain('/[unclosed/i');
    expectNoWorkspaceWork();
  });

  it('names the typed pattern, not the whole-word wrapper, for a malformed whole-word regex', async () => {
    const message = regexMessage('(abc');
    const result = await grep({ pattern: '(abc', word: true });
    expect(result).toBe(`${message}\n${LITERAL_HINT}`);
    expect(result).toContain('/(abc/i');
    expect(result).not.toContain(String.raw`(?<!\w)`);
    expectNoWorkspaceWork();
  });

  it('refuses a pattern that matches empty text', async () => {
    expect(await grep({ pattern: 'x*' })).toBe('Pattern matches empty text, so it would match every line: x*.');
    expectNoWorkspaceWork();
  });

  it('refuses a start anchor that matches empty text', async () => {
    expect(await grep({ pattern: '^' })).toBe('Pattern matches empty text, so it would match every line: ^.');
    expectNoWorkspaceWork();
  });

  it('searches literal regex punctuation as typed text', async () => {
    write('punct.txt', '.*\n');
    expect(await grep({ pattern: '.*', literal: true })).toBe('punct.txt:1: .*');
  });

  it('reports a malformed regex before a missing path', async () => {
    const message = regexMessage('[unclosed');
    expect(await grep({ pattern: '[unclosed', path: './missing/' })).toBe(`${message}\n${LITERAL_HINT}`);
    expectNoWorkspaceWork();
  });

  it('refuses an empty match before a secret path and an expired deadline', async () => {
    expect(await grep({ pattern: 'x*', path: '.env' }, Date.now() - 1))
      .toBe('Pattern matches empty text, so it would match every line: x*.');
    expectNoWorkspaceWork();
  });
});

describe('rows and formatting', () => {
  it('reports one row at the first span for repeated matches on a line', async () => {
    write('repeat.txt', '  needle and needle\n');
    expect(await grep()).toBe('repeat.txt:1: needle and needle');
  });

  it('keeps one-based line order across multiple lines', async () => {
    write('ordering.txt', 'needle one\nnone\nneedle three\n');
    expect(await grep()).toBe('ordering.txt:1: needle one\nordering.txt:3: needle three');
  });

  it('drops a trailing carriage return only from the preview', async () => {
    write('crlf.txt', 'needle\r\n');
    expect(await grep()).toBe('crlf.txt:1: needle');
  });

  it('does not match an end anchor before a carriage return', async () => {
    write('crlf.txt', 'needle\r\n');
    expect(await grep({ pattern: 'needle$' })).toBe(NO_MATCHES);
  });

  it('finds no row for a regex spanning a newline', async () => {
    write('lines.txt', 'needle\nsecond\n');
    expect(await grep({ pattern: String.raw`needle\s+second` })).toBe(NO_MATCHES);
  });

  it('uses the formatter window for a long first-match preview', async () => {
    write('long.txt', `${'x'.repeat(300)}needle\n`);
    expect(await grep()).toBe(`long.txt:1: …${'x'.repeat(194)}needle`);
  });

  it('reports exactly the no-match sentinel', async () => {
    write('quiet.txt', 'nothing here\n');
    expect(await grep()).toBe(NO_MATCHES);
  });
});

describe('targets and discovery', () => {
  it('scans a nested ./src directory and prints root-relative rows', async () => {
    write('top.ts', 'needle\n');
    write('src/a.ts', 'needle\n');
    expect(await grep({ path: './src' })).toBe('src/a.ts:1: needle');
    expect(vi.mocked(listProjectFiles)).toHaveBeenCalledWith(path.join(root, 'src'));
  });

  it('scans the canonical root through a safe root alias', async () => {
    write('a.ts', 'needle\n');
    const alias = path.join(base, 'alias');
    symlinkSync(root, alias);
    expect(await grep({}, Date.now() + 5000, alias)).toBe('a.ts:1: needle');
    expect(vi.mocked(listProjectFiles)).toHaveBeenCalledWith(root);
  });

  it('selects only a named file without its siblings or same-named descendants', async () => {
    write('src/a.ts', 'needle\n');
    write('src/b.ts', 'needle\n');
    write('src/sub/a.ts', 'needle\n');
    expect(await grep({ path: 'src/a.ts' })).toBe('src/a.ts:1: needle');
  });

  it('accepts a named file whose basename an include matches', async () => {
    write('src/a.ts', 'needle\n');
    expect(await grep({ path: 'src/a.ts', include: '*.ts' })).toBe('src/a.ts:1: needle');
  });

  it('rejects a named file whose basename an include does not match', async () => {
    write('src/a.ts', 'needle\n');
    expect(await grep({ path: 'src/a.ts', include: '*.md' })).toBe(NO_MATCHES);
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('lets exclude override include for a named file', async () => {
    write('src/a.ts', 'needle\n');
    expect(await grep({ path: 'src/a.ts', include: '*.ts', exclude: '*.ts' })).toBe(NO_MATCHES);
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('keeps a git-ignored untracked named file absent', async () => {
    initRepo();
    write('.gitignore', 'ignored.txt\n');
    commitAll();
    write('ignored.txt', 'needle\n');
    expect(await grep({ path: 'ignored.txt' })).toBe(NO_MATCHES);
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('skips a secret named file', async () => {
    write('.env', 'needle\n');
    expect(await grep({ path: '.env' })).toBe(NO_MATCHES);
    expect(vi.mocked(listProjectFiles)).not.toHaveBeenCalled();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('skips the default path under a mocked home-secret root', async () => {
    const secretRoot = path.join(homeDirectory, '.ssh', 'workspace');
    mkdirSync(secretRoot, { recursive: true });
    writeFileSync(path.join(secretRoot, 'notes.txt'), 'needle\n');
    expect(await grepWorkspace(secretRoot, args(), Date.now() + 5000)).toBe(NO_MATCHES);
    expect(vi.mocked(listProjectFiles)).not.toHaveBeenCalled();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('skips a final link', async () => {
    write('real.txt', 'needle\n');
    symlinkSync(path.join(root, 'real.txt'), path.join(root, 'link.txt'));
    expect(await grep({ path: 'link.txt' })).toBe(NO_MATCHES);
    expect(vi.mocked(listProjectFiles)).not.toHaveBeenCalled();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('never opens a stale indexed path beneath a replaced ancestor link', async () => {
    initRepo();
    write('stale/notes.txt', 'needle\n');
    commitAll();
    rmSync(path.join(root, 'stale'), { recursive: true });
    mkdirSync(path.join(root, 'replacement'));
    symlinkSync(path.join(root, 'replacement'), path.join(root, 'stale'));

    expect(await grep()).toBe(NO_MATCHES);
    expect(vi.mocked(scanFiles).mock.calls[0]?.[1]).toContain('stale/notes.txt');
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
    expect(vi.mocked(createMatcherWorker)).not.toHaveBeenCalled();
  });

  it('skips a named binary file', async () => {
    write('binary.dat', Buffer.from([0x6e, 0x00, 0x65, 0x65]));
    expect(await grep({ path: 'binary.dat' })).toBe(NO_MATCHES);
    expect(vi.mocked(createMatcherWorker)).not.toHaveBeenCalled();
  });

  it('skips a named oversized file without reading it', async () => {
    write('big.txt', 'a'.repeat(SEARCH_MAX_FILE_BYTES + 1));
    expect(await grep({ path: 'big.txt' })).toBe(NO_MATCHES);
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
    expect(vi.mocked(createMatcherWorker)).not.toHaveBeenCalled();
  });

  it('skips a named FIFO', async () => {
    execFileSync('mkfifo', [path.join(root, 'pipe')]);
    expect(await grep({ path: 'pipe' })).toBe(NO_MATCHES);
    expect(vi.mocked(listProjectFiles)).not.toHaveBeenCalled();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('skips a candidate that disappears after discovery', async () => {
    vi.mocked(listProjectFiles).mockResolvedValue(['vanished.txt']);
    expect(await grep()).toBe(NO_MATCHES);
    expect(vi.mocked(scanFiles).mock.calls[0]?.[1]).toEqual(['vanished.txt']);
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
    expect(vi.mocked(createMatcherWorker)).not.toHaveBeenCalled();
  });
});

describe('unmerged index integration', () => {
  it('searches one row per matching line without repeating index stages', async () => {
    initRepo();
    write('a.txt', 'no match\n');
    write('merged.txt', 'needle one\nneedle two\n');
    commitAll();
    const ordinaryIndex = git(['ls-files']);
    const alternateIndex = path.join(base, 'alternate-index');
    const env = { ...process.env, GIT_INDEX_FILE: alternateIndex };
    git(['read-tree', 'HEAD'], env);
    const blob = git(['hash-object', '-w', 'merged.txt']).trim();
    const zero = '0'.repeat(40);
    const stages = `0 ${zero}\tmerged.txt\n100644 ${blob} 1\tmerged.txt\n100644 ${blob} 2\tmerged.txt\n100644 ${blob} 3\tmerged.txt\n`;
    execFileSync('git', ['update-index', '--index-info'], { cwd: root, env, input: stages, encoding: 'utf8' });
    process.env.GIT_INDEX_FILE = alternateIndex;

    try {
      await expect(listProjectFiles(root)).resolves.toEqual(['a.txt', 'merged.txt', 'merged.txt', 'merged.txt']);
      expect(await grep({ limit: 2 })).toBe('merged.txt:1: needle one\nmerged.txt:2: needle two');
    } finally {
      delete process.env.GIT_INDEX_FILE;
    }

    expect(git(['ls-files'])).toBe(ordinaryIndex);
    await expect(listProjectFiles(root)).resolves.toEqual(['a.txt', 'merged.txt']);
  });
});

describe('resolver diagnostics', () => {
  it('preserves the typed spelling of a missing path', async () => {
    expect(await grep({ path: './missing/' })).toBe('Path not found: ./missing/.');
    expect(vi.mocked(listProjectFiles)).not.toHaveBeenCalled();
  });

  it('refuses an absolute path inside the root', async () => {
    const absolute = path.join(root, 'a.txt');
    expect(await grep({ path: absolute })).toBe(`Outside the workspace: ${absolute}.`);
    expect(vi.mocked(listProjectFiles)).not.toHaveBeenCalled();
  });

  it('refuses a normalized parent escape', async () => {
    expect(await grep({ path: 'src/../../outside' })).toBe('Outside the workspace: src/../../outside.');
    expect(vi.mocked(listProjectFiles)).not.toHaveBeenCalled();
  });

  it('refuses a resolvable link outside the root', async () => {
    const outside = path.join(base, 'outside');
    mkdirSync(outside);
    writeFileSync(path.join(outside, 'notes.txt'), 'needle\n');
    symlinkSync(path.join(outside, 'notes.txt'), path.join(root, 'out.txt'));
    expect(await grep({ path: 'out.txt' })).toBe('Outside the workspace: out.txt.');
    expect(vi.mocked(listProjectFiles)).not.toHaveBeenCalled();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });
});

describe('formatted endings', () => {
  it('prints the rows selected by the sentinel and the limit trailer', async () => {
    write('f.txt', 'needle\nneedle\nneedle\n');
    expect(await grep({ limit: 2 }))
      .toBe('f.txt:1: needle\nf.txt:2: needle\n(showing the first 2 matches; narrow the pattern or raise --limit)');
  });

  it('prints no trailer when exactly the limit has been exhausted', async () => {
    write('f.txt', 'needle\nneedle\n');
    expect(await grep({ limit: 2 })).toBe('f.txt:1: needle\nf.txt:2: needle');
  });

  it('keeps earlier rows and the scan timeout trailer', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    vi.mocked(resolveGrepTarget).mockResolvedValue(directoryTarget());
    vi.mocked(discoverGrepCandidates).mockResolvedValue(['a.txt', 'b.txt']);
    const first = row('a.txt');
    const later = Promise.withResolvers<string | null>();
    vi.mocked(createCandidateReader).mockResolvedValue(
      vi.fn((relPath: string) => relPath === 'a.txt' ? Promise.resolve('needle') : later.promise),
    );
    const worker = workerMock();
    worker.rows.mockImplementation(async (relPath: string) => relPath === 'a.txt' ? [first] : []);
    vi.mocked(createMatcherWorker).mockReturnValue(worker);

    const result = grep({}, 1100);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toBe(`a.txt:1: needle\n${TIMEOUT_LINE}`);
    expect(worker.dispose).toHaveBeenCalledOnce();
  });

  it('keeps earlier rows and the typed slow ending', async () => {
    vi.mocked(resolveGrepTarget).mockResolvedValue(directoryTarget());
    vi.mocked(discoverGrepCandidates).mockResolvedValue(['a.txt', 'b.txt']);
    vi.mocked(createCandidateReader).mockResolvedValue(vi.fn(async (relPath: string) => `${relPath} needle`));
    const first = row('a.txt');
    const worker = workerMock();
    worker.rows
      .mockResolvedValueOnce([first])
      .mockRejectedValueOnce(new MatcherDeadlineError('Search matching exceeded its 1000 ms deadline'));
    vi.mocked(createMatcherWorker).mockReturnValue(worker);

    expect(await grep())
      .toBe(`a.txt:1: needle\n(search stopped: the pattern took too long on b.txt; simplify it or use --literal)`);
    expect(worker.dispose).toHaveBeenCalledOnce();
  });
});

describe('deadlines', () => {
  it('returns timeout for an already expired deadline without invoking resolution', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    await expect(grep({}, 999)).resolves.toBe(TIMEOUT_RESULT);
    expect(vi.mocked(resolveGrepTarget)).not.toHaveBeenCalled();
    expect(vi.mocked(listProjectFiles)).not.toHaveBeenCalled();
  });

  it('returns timeout for a deadline exactly at the current time without invoking resolution', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    await expect(grep({}, 1000)).resolves.toBe(TIMEOUT_RESULT);
    expect(vi.mocked(resolveGrepTarget)).not.toHaveBeenCalled();
    expect(vi.mocked(listProjectFiles)).not.toHaveBeenCalled();
  });

  it('times out a pending resolver before discovery starts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const pending = Promise.withResolvers<ResolvedGrepTarget>();
    vi.mocked(resolveGrepTarget).mockReturnValue(pending.promise);
    const result = grep({}, 1100);

    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toBe(TIMEOUT_RESULT);
    expect(vi.mocked(listProjectFiles)).not.toHaveBeenCalled();
    expect(vi.mocked(createCandidateReader)).not.toHaveBeenCalled();
  });

  it('starts no listing for a resolver that succeeds after timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const pending = Promise.withResolvers<ResolvedGrepTarget>();
    vi.mocked(resolveGrepTarget).mockReturnValue(pending.promise);
    const result = grep({}, 1100);

    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toBe(TIMEOUT_RESULT);
    pending.resolve(directoryTarget());
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(listProjectFiles)).not.toHaveBeenCalled();
    expect(vi.mocked(createCandidateReader)).not.toHaveBeenCalled();
  });

  it('observes a resolver rejection that arrives after timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const pending = Promise.withResolvers<ResolvedGrepTarget>();
      vi.mocked(resolveGrepTarget).mockReturnValue(pending.promise);
      const result = grep({}, 1100);
      await vi.advanceTimersByTimeAsync(100);
      await expect(result).resolves.toBe(TIMEOUT_RESULT);
      pending.reject(new Error('late resolver failure'));
      await vi.advanceTimersByTimeAsync(0);
      await expect(result).resolves.toBe(TIMEOUT_RESULT);
      expect(unhandled).not.toHaveBeenCalled();
      expect(vi.mocked(listProjectFiles)).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('times out pending discovery before scan starts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    vi.mocked(resolveGrepTarget).mockResolvedValue(directoryTarget());
    const pending = Promise.withResolvers<string[]>();
    vi.mocked(discoverGrepCandidates).mockReturnValue(pending.promise);
    const result = grep({}, 1100);

    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toBe(TIMEOUT_RESULT);
    expect(vi.mocked(createCandidateReader)).not.toHaveBeenCalled();
    pending.resolve(['a.txt']);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(createCandidateReader)).not.toHaveBeenCalled();
  });

  it('starts no filter worker, read or match when listing settles after timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    vi.mocked(resolveGrepTarget).mockResolvedValue(directoryTarget());
    const listing = Promise.withResolvers<string[]>();
    vi.mocked(listProjectFiles).mockReturnValue(listing.promise);
    const result = grep({ include: '*.ts' }, 1100);

    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toBe(TIMEOUT_RESULT);
    const signal = discoverySignals[0];
    expect(signal?.aborted).toBe(true);
    expect(discoveryAborts).toBe(1);

    listing.resolve(['a.ts']);
    await vi.advanceTimersByTimeAsync(0);
    expect(filterEntries()).toHaveLength(0);
    expect(vi.mocked(createCandidateReader)).not.toHaveBeenCalled();
    expect(vi.mocked(createMatcherWorker)).not.toHaveBeenCalled();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
    expect(discoveryRejections).toHaveLength(1);
    expect(discoveryRejections[0]).toBe(signal?.reason);
  });

  it('observes a listing rejection that arrives after timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      vi.mocked(resolveGrepTarget).mockResolvedValue(directoryTarget());
      const listing = Promise.withResolvers<string[]>();
      vi.mocked(listProjectFiles).mockReturnValue(listing.promise);
      const result = grep({ include: '*.ts' }, 1100);

      await vi.advanceTimersByTimeAsync(100);
      await expect(result).resolves.toBe(TIMEOUT_RESULT);
      const failure = new Error('late listing failure');
      listing.reject(failure);
      await vi.advanceTimersByTimeAsync(0);
      expect(discoveryRejections).toHaveLength(1);
      expect(discoveryRejections[0]).toBe(failure);
      expect(unhandled).not.toHaveBeenCalled();
      expect(filterEntries()).toHaveLength(0);
      expect(vi.mocked(createCandidateReader)).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('leaves only the remainder of the budget for discovery', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const resolution = Promise.withResolvers<ResolvedGrepTarget>();
    vi.mocked(resolveGrepTarget).mockReturnValue(resolution.promise);
    const listing = Promise.withResolvers<string[]>();
    vi.mocked(listProjectFiles).mockReturnValue(listing.promise);
    const result = grep({}, 1100);

    await vi.advanceTimersByTimeAsync(60);
    resolution.resolve(directoryTarget());
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(listProjectFiles)).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(40);
    await expect(result).resolves.toBe(TIMEOUT_RESULT);
    expect(vi.mocked(createCandidateReader)).not.toHaveBeenCalled();
  });

  it('hands an unchanged expired deadline from discovery to scan', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    vi.mocked(resolveGrepTarget).mockResolvedValue(directoryTarget());
    const pending = Promise.withResolvers<string[]>();
    vi.mocked(discoverGrepCandidates).mockReturnValue(pending.promise);
    const result = grep({}, 1100);

    await vi.advanceTimersByTimeAsync(90);
    vi.setSystemTime(1100);
    pending.resolve(['a.txt']);
    await vi.advanceTimersByTimeAsync(0);

    await expect(result).resolves.toBe(TIMEOUT_RESULT);
    expect(vi.mocked(createCandidateReader)).not.toHaveBeenCalled();
    expect(vi.mocked(scanFiles)).toHaveBeenCalledOnce();
    expect(vi.mocked(scanFiles).mock.calls[0]?.[3]).toBe(1100);
  });

  it('keeps a resolver failure observed before timeout', async () => {
    vi.mocked(resolveGrepTarget).mockResolvedValue({ kind: 'failure', text: 'Path not found: typed.' });
    expect(await grep({ path: 'typed' })).toBe('Path not found: typed.');
    expect(vi.mocked(discoverGrepCandidates)).not.toHaveBeenCalled();
  });

  it('preserves an unexpected resolver rejection identity', async () => {
    const failure = new Error('resolver failed');
    vi.mocked(resolveGrepTarget).mockRejectedValue(failure);
    await expect(grep()).rejects.toBe(failure);
    expect(vi.mocked(discoverGrepCandidates)).not.toHaveBeenCalled();
  });

  it('preserves a discovery rejection identity and aborts its signal once', async () => {
    const failure = new Error('discovery failed');
    vi.mocked(resolveGrepTarget).mockResolvedValue(directoryTarget());
    vi.mocked(discoverGrepCandidates).mockImplementation((_target, _include, _exclude, signal) => {
      discoverySignals.push(signal);
      signal.addEventListener('abort', () => {
        discoveryAborts += 1;
      });
      return Promise.reject(failure);
    });

    await expect(grep()).rejects.toBe(failure);
    expect(discoveryAborts).toBe(1);
    expect(vi.mocked(createCandidateReader)).not.toHaveBeenCalled();
    expect(vi.mocked(createMatcherWorker)).not.toHaveBeenCalled();
  });

  it('preserves a scan rejection identity', async () => {
    const failure = new Error('scan failed');
    vi.mocked(resolveGrepTarget).mockResolvedValue(directoryTarget());
    vi.mocked(discoverGrepCandidates).mockResolvedValue(['a.txt']);
    vi.mocked(createCandidateReader).mockRejectedValue(failure);

    await expect(grep()).rejects.toBe(failure);
    expect(vi.mocked(createCandidateReader)).toHaveBeenCalledOnce();
  });
});

describe('discovery lifecycle', () => {
  it('aborts discovery once before scan and gives scan its own live signal', async () => {
    write('a.txt', 'needle\n');
    write('b.md', 'needle\n');
    const captured = Promise.withResolvers<{ worker: Worker; terminate: WorkerTermination }>();
    workerControl.onCreate = (entry) => {
      if (!isFilterEntry(entry)) return;
      const worker = entry.worker as Worker;
      captured.resolve({ worker, terminate: watchTermination(worker) });
    };
    let discoveryAbortedWhenReaderStarted: boolean | undefined;
    let readerSignal: AbortSignal | undefined;
    vi.mocked(createCandidateReader).mockImplementation(async (targetRoot, signal) => {
      discoveryAbortedWhenReaderStarted = discoverySignals[0]?.aborted;
      readerSignal = signal;
      return actualReader.createCandidateReader(targetRoot, signal);
    });
    let matcherSignal: AbortSignal | undefined;
    vi.mocked(createMatcherWorker).mockImplementation((query, modes, signal, options) => {
      matcherSignal = signal;
      return actualMatching.createMatcherWorker(query, modes, signal, options);
    });

    expect(await grep({ include: '*.txt' })).toBe('a.txt:1: needle');
    const { worker, terminate } = await captured.promise;

    expect(discoveryAborts).toBe(1);
    expect(discoveryAbortedWhenReaderStarted).toBe(true);
    expect(readerSignal).toBeDefined();
    expect(readerSignal).not.toBe(discoverySignals[0]);
    expect(readerSignal?.aborted).toBe(false);
    expect(matcherSignal).toBeDefined();
    expect(matcherSignal).not.toBe(discoverySignals[0]);
    expect(matcherSignal?.aborted).toBe(false);
    expect(terminate).toHaveBeenCalledOnce();
    await waitFor(() => worker.listenerCount('message') === 0);
    await waitFor(() => worker.listenerCount('error') === 0);
    await waitFor(() => worker.listenerCount('exit') === 0);
  });

  it('aborts discovery once and preserves an unexpected listing failure', async () => {
    const failure = new Error('listing failed');
    vi.mocked(listProjectFiles).mockRejectedValue(failure);

    await expect(grep()).rejects.toBe(failure);
    expect(discoveryAborts).toBe(1);
    expect(filterEntries()).toHaveLength(0);
    expect(vi.mocked(createCandidateReader)).not.toHaveBeenCalled();
    expect(vi.mocked(createMatcherWorker)).not.toHaveBeenCalled();
  });

  it('aborts discovery once and preserves an ordinary filter-worker failure', async () => {
    const failure = new Error('filter worker failed');
    let fake: FakeWorker | undefined;
    workerControl.factory = () => {
      fake = new FakeWorker();
      const current = fake;
      queueMicrotask(() => {
        current.fail(failure);
      });
      return current;
    };
    write('a.txt', 'needle\n');

    await expect(grep({ include: '*.txt' })).rejects.toBe(failure);
    expect(discoveryAborts).toBe(1);
    expect(fake?.terminate).toHaveBeenCalledOnce();
    expect(vi.mocked(createCandidateReader)).not.toHaveBeenCalled();
    expect(vi.mocked(createMatcherWorker)).not.toHaveBeenCalled();
    await flush();
    expect(fake?.listenerCount('message')).toBe(0);
    expect(fake?.listenerCount('error')).toBe(0);
    expect(fake?.listenerCount('exit')).toBe(0);
  });

  it('constructs the timeout result before abort rejects pending discovery', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    vi.mocked(resolveGrepTarget).mockResolvedValue(directoryTarget());
    const rejections: unknown[] = [];
    let formatCallsAtAbort = -1;
    vi.mocked(discoverGrepCandidates).mockImplementation(async (_target, _include, _exclude, signal) => {
      discoverySignals.push(signal);
      try {
        return await new Promise<string[]>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            formatCallsAtAbort = vi.mocked(formatGrepResult).mock.calls.length;
            reject(signal.reason);
          });
        });
      } catch (error) {
        rejections.push(error);
        throw error;
      }
    });

    const result = grep({}, 1100);
    await vi.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toBe(TIMEOUT_RESULT);
    const signal = discoverySignals[0];
    expect(formatCallsAtAbort).toBe(1);
    expect(vi.mocked(formatGrepResult).mock.calls[0]).toEqual([[], { kind: 'timeout' }]);
    expect(signal?.aborted).toBe(true);
    expect(signal?.reason).toBeInstanceOf(DOMException);
    expect((signal?.reason as DOMException).name).toBe('AbortError');
    expect(rejections).toHaveLength(1);
    expect(rejections[0]).toBe(signal?.reason);
    expect(vi.mocked(createCandidateReader)).not.toHaveBeenCalled();
  });

  it('observes an adapter termination rejection after timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    vi.mocked(resolveGrepTarget).mockResolvedValue(directoryTarget());
    vi.mocked(listProjectFiles).mockResolvedValue(['a.txt']);
    const termination = Promise.withResolvers<number>();
    let fake: FakeWorker | undefined;
    workerControl.factory = () => {
      fake = new FakeWorker();
      fake.termination = termination.promise;
      return fake;
    };
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const result = grep({ include: '*.txt' }, 1100);
      await vi.advanceTimersByTimeAsync(100);
      await expect(result).resolves.toBe(TIMEOUT_RESULT);
      expect(fake?.terminate).toHaveBeenCalledOnce();

      termination.reject(new Error('termination failed'));
      await vi.advanceTimersByTimeAsync(0);
      await expect(result).resolves.toBe(TIMEOUT_RESULT);
      expect(unhandled).not.toHaveBeenCalled();
      expect(vi.mocked(createCandidateReader)).not.toHaveBeenCalled();
      expect(fake?.listenerCount('message')).toBe(0);
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

const HOSTILE_PLUS = '+(a|aa)b';
const HOSTILE_STAR = `${'*a'.repeat(12)}b`;
const HOSTILE_PLUS_NAME = `${'a'.repeat(100)}c`;
const HOSTILE_STAR_NAME = `${'a'.repeat(200)}c`;

function seedHostileRoot(): void {
  write(HOSTILE_PLUS_NAME, 'needle\n');
  write(HOSTILE_STAR_NAME, 'needle\n');
  write('match.txt', 'needle\n');
}

function captureFilterWorker(): Promise<{ worker: Worker; terminate: WorkerTermination }> {
  const captured = Promise.withResolvers<{ worker: Worker; terminate: WorkerTermination }>();
  workerControl.onCreate = (entry) => {
    if (!isFilterEntry(entry)) return;
    const worker = entry.worker as Worker;
    captured.resolve({ worker, terminate: watchTermination(worker) });
  };
  return captured.promise;
}

async function expectHostileTimeout(include: string, exclude: string): Promise<void> {
  seedHostileRoot();
  const captured = captureFilterWorker();
  const started = Date.now();
  const deadline = started + 2500;
  let heartbeat = false;
  const heartbeatTimer = setTimeout(() => {
    heartbeat = true;
  }, 100);
  let settled = false;
  const call = grepWorkspace(root, args({ include, exclude }), deadline);
  void call.then(() => {
    settled = true;
  }, () => {
    settled = true;
  });
  const { worker, terminate } = await captured;
  const exited = once(worker, 'exit');
  await once(worker, 'online');
  await sleep(300);
  expect(heartbeat).toBe(true);
  expect(settled).toBe(false);

  const text = await call;
  clearTimeout(heartbeatTimer);

  expect(text).toBe(TIMEOUT_RESULT);
  // Node timers run on a monotonic clock whose millisecond phase can place the
  // callback one millisecond before the wall-clock deadline used to arm it.
  expect(Date.now()).toBeGreaterThanOrEqual(deadline - 1);
  expect(terminate).toHaveBeenCalledOnce();
  expect(vi.mocked(createCandidateReader)).not.toHaveBeenCalled();
  expect(vi.mocked(createMatcherWorker)).not.toHaveBeenCalled();
  expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  await exited;
  expect(worker.threadId).toBe(-1);
  await waitFor(() => worker.listenerCount('message') === 0);
  await waitFor(() => worker.listenerCount('error') === 0);
  await waitFor(() => worker.listenerCount('exit') === 0);
}

describe('hostile include and exclude budgets', () => {
  it('stops a hostile include at the caller deadline', async () => {
    await expectHostileTimeout(HOSTILE_PLUS, '');
  }, 20_000);

  it('stops a hostile exclude at the caller deadline', async () => {
    await expectHostileTimeout('*', HOSTILE_PLUS);
  }, 20_000);

  it('stops a repeated-star include at the caller deadline', async () => {
    await expectHostileTimeout(HOSTILE_STAR, '');
  }, 20_000);

  it('stops a repeated-star exclude at the caller deadline', async () => {
    await expectHostileTimeout('*', HOSTILE_STAR);
  }, 20_000);

  it('serves a safe call after a hostile filter times out and exits', async () => {
    await expectHostileTimeout(HOSTILE_PLUS, '');
    const captured = captureFilterWorker();
    const result = await grep({ include: '*.txt' }, Date.now() + 10_000);

    expect(result).toBe('match.txt:1: needle');
    const { worker, terminate } = await captured;
    expect(terminate).toHaveBeenCalledOnce();
    await waitFor(() => worker.threadId === -1);
    await waitFor(() => worker.listenerCount('message') === 0);
    await waitFor(() => worker.listenerCount('error') === 0);
    await waitFor(() => worker.listenerCount('exit') === 0);
  }, 30_000);
});

describe('command entry', () => {
  it('returns the usage line without calling workspace services', async () => {
    expect(await grepWorkspaceCommand(root, 'file grep')).toBe(FILE_GREP_USAGE);
    expectNoWorkspaceWork();
  });

  it('delegates flags-first arguments with --path before the pattern', async () => {
    write('src/a.ts', 'needle\n');
    expect(await grepWorkspaceCommand(root, 'file grep --path src needle')).toBe('src/a.ts:1: needle');
  });

  it('keeps a multiword literal pattern and its flags', async () => {
    write('notes.md', 'request timed out\n');
    expect(await grepWorkspaceCommand(root, 'file grep --literal --include *.md request timed out'))
      .toBe('notes.md:1: request timed out');
  });

  it('treats flags after the first pattern token as pattern text', async () => {
    write('flags.txt', 'needle --limit 3\n');
    expect(await grepWorkspaceCommand(root, 'file grep needle --limit 3')).toBe('flags.txt:1: needle --limit 3');
    const scanned = vi.mocked(scanFiles).mock.calls[0]?.[2];
    expect(scanned?.pattern).toBe('needle --limit 3');
    expect(scanned?.limit).toBe(100);
  });

  it('creates one fresh 30,000 ms deadline for every stage', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    vi.mocked(resolveGrepTarget).mockResolvedValue(directoryTarget());
    vi.mocked(discoverGrepCandidates).mockResolvedValue([]);
    vi.mocked(scanFiles).mockResolvedValue({ rows: [], ending: undefined });

    expect(await grepWorkspaceCommand(root, 'file grep needle')).toBe(NO_MATCHES);
    expect(GREP_TIMEOUT_MS).toBe(30_000);
    const deadlines = vi.mocked(withDeadline).mock.calls.map(([deadline]) => deadline);
    expect(deadlines).toHaveLength(2);
    expect(deadlines).toEqual([31_000, 31_000]);
    expect(vi.mocked(scanFiles).mock.calls[0]?.[3]).toBe(31_000);
  });
});
