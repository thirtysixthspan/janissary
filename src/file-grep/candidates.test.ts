import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import type * as fileSystemPromises from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type * as workerThreads from 'node:worker_threads';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as searchModule from '../file-navigator/search.js';
import { listProjectFiles } from '../file-navigator/search.js';
import type * as matchingWorker from '../search/matching-worker.js';
import { createMatcherWorker } from '../search/matching-worker.js';
import type * as readCandidateModule from './read-candidate.js';
import { createCandidateReader } from './read-candidate.js';
import { discoverGrepCandidates } from './candidates.js';
import type { GrepSearchTarget } from './path-target.js';

vi.mock('../file-navigator/search.js', async (importOriginal) => {
  const actual = await importOriginal<typeof searchModule>();
  return { listProjectFiles: vi.fn(actual.listProjectFiles) };
});

vi.mock('../search/matching-worker.js', async (importOriginal) => {
  const actual = await importOriginal<typeof matchingWorker>();
  return { ...actual, createMatcherWorker: vi.fn(actual.createMatcherWorker) };
});

vi.mock('./read-candidate.js', async (importOriginal) => {
  const actual = await importOriginal<typeof readCandidateModule>();
  return { ...actual, createCandidateReader: vi.fn(actual.createCandidateReader) };
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fileSystemPromises>();
  return { ...actual, readdir: vi.fn(actual.readdir) };
});

const workers = vi.hoisted(() => ({ instances: [] as unknown[], urls: [] as URL[] }));

vi.mock('node:worker_threads', async (importOriginal) => {
  const actual = await importOriginal<typeof workerThreads>();
  const Worker = vi.fn(function (url: URL, options: workerThreads.WorkerOptions) {
    const worker = new actual.Worker(url, options);
    workers.instances.push(worker);
    workers.urls.push(url);
    return worker;
  });
  return { ...actual, Worker };
});

const actualFs = await vi.importActual<typeof fileSystemPromises>('node:fs/promises');
const actualSearch = await vi.importActual<typeof searchModule>('../file-navigator/search.js');

const savedEnv = { GIT_DIR: process.env.GIT_DIR, GIT_INDEX_FILE: process.env.GIT_INDEX_FILE };

let base: string;
let root: string;

function restoreEnv(): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => {
  base = realpathSync(mkdtempSync(path.join(tmpdir(), 'file-grep-candidates-')));
  root = path.join(base, 'workspace');
  mkdirSync(root);
  vi.mocked(listProjectFiles).mockReset().mockImplementation(actualSearch.listProjectFiles);
  vi.mocked(readdir).mockReset().mockImplementation(actualFs.readdir as typeof readdir);
  workers.instances = [];
  workers.urls = [];
});

afterEach(() => {
  expect(vi.mocked(createCandidateReader)).not.toHaveBeenCalled();
  expect(vi.mocked(createMatcherWorker)).not.toHaveBeenCalled();
  restoreEnv();
  vi.clearAllMocks();
  rmSync(base, { recursive: true, force: true });
});

function writeFile(relative: string, content = 'text\n'): string {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

function directoryTarget(searchDir = root, prefix = ''): GrepSearchTarget {
  return { kind: 'directory', root, prefix, searchDir };
}

function fileTarget(filePath: string, prefix: string): GrepSearchTarget {
  return { kind: 'file', root, prefix, filePath };
}

function discover(include = '', exclude = '', signal = new AbortController().signal): Promise<string[]> {
  return discoverGrepCandidates(directoryTarget(), include, exclude, signal);
}

function git(args: string[], env: NodeJS.ProcessEnv = process.env): string {
  return execFileSync('git', args, { cwd: root, env, encoding: 'utf8' });
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

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  return Promise.withResolvers<T>();
}

describe('git listings', () => {
  it('includes a tracked ordinary file', async () => {
    initRepo();
    writeFile('a.txt');
    commitAll();
    await expect(discover()).resolves.toEqual(['a.txt']);
  });

  it('includes an untracked nonignored file', async () => {
    initRepo();
    writeFile('a.txt');
    commitAll();
    writeFile('b.txt');
    await expect(discover()).resolves.toEqual(['a.txt', 'b.txt']);
  });

  it('omits an ignored untracked file', async () => {
    initRepo();
    writeFile('.gitignore', 'ignored.txt\n');
    commitAll();
    writeFile('ignored.txt');
    await expect(discover()).resolves.toEqual(['.gitignore']);
  });

  it('includes a tracked dotfile', async () => {
    initRepo();
    writeFile('.github/workflows/ci.yml');
    commitAll();
    await expect(discover()).resolves.toEqual(['.github/workflows/ci.yml']);
  });

  it('includes a tracked file that an ignore rule covers', async () => {
    initRepo();
    writeFile('tracked.txt');
    commitAll();
    writeFile('.gitignore', 'tracked.txt\n');
    commitAll();
    await expect(discover()).resolves.toEqual(['.gitignore', 'tracked.txt']);
  });

  it('collapses unmerged index stages to one candidate', async () => {
    initRepo();
    writeFile('a.txt');
    writeFile('merged.txt', 'one\n');
    commitAll();
    const alternateIndex = path.join(base, 'alternate-index');
    const env = { ...process.env, GIT_INDEX_FILE: alternateIndex };
    git(['read-tree', 'HEAD'], env);
    const blob = git(['hash-object', '-w', 'merged.txt']).trim();
    const zero = '0'.repeat(40);
    const stages = `0 ${zero}\tmerged.txt\n100644 ${blob} 1\tmerged.txt\n100644 ${blob} 2\tmerged.txt\n100644 ${blob} 3\tmerged.txt\n`;
    execFileSync('git', ['update-index', '--index-info'], { cwd: root, env, input: stages, encoding: 'utf8' });
    process.env.GIT_INDEX_FILE = alternateIndex;

    await expect(listProjectFiles(root)).resolves.toEqual(['a.txt', 'merged.txt', 'merged.txt', 'merged.txt']);
    await expect(discover()).resolves.toEqual(['a.txt', 'merged.txt']);

    delete process.env.GIT_INDEX_FILE;
    await expect(listProjectFiles(root)).resolves.toEqual(['a.txt', 'merged.txt']);
  });
});

describe('fallback listings', () => {
  it.each(['.git', '.svn', '.hg', '.DS_Store', 'Thumbs.db'])(
    'omits %s at every depth in the fallback walk',
    async (name) => {
      writeFile('keep.txt');
      writeFile(path.join(name, 'inner.txt'));
      writeFile(path.join('nested', 'keep.txt'));
      writeFile(path.join('nested', name, 'inner.txt'));
      await expect(discover()).resolves.toEqual(['keep.txt', 'nested/keep.txt']);
    },
  );

  it('retains node_modules in the fallback walk', async () => {
    writeFile('keep.txt');
    writeFile('node_modules/pkg/index.js');
    await expect(discover()).resolves.toEqual(['keep.txt', 'node_modules/pkg/index.js']);
  });

  it('retains an ordinary dotfile in the fallback walk', async () => {
    writeFile('.hidden');
    writeFile('keep.txt');
    await expect(discover()).resolves.toEqual(['.hidden', 'keep.txt']);
  });

  it('falls back when the git invocation fails for a reason other than a missing repository', async () => {
    initRepo();
    writeFile('.hidden');
    writeFile('a.txt');
    commitAll();
    writeFile('node_modules/x.js');
    process.env.GIT_DIR = path.join(base, 'missing-git-directory');
    await expect(discover()).resolves.toEqual(['.hidden', 'a.txt', 'node_modules/x.js']);
  });

  it('yields no entries from an unreadable subtree', async () => {
    writeFile('ok.txt');
    writeFile('locked/secret.txt');
    const locked = path.join(root, 'locked');
    const deny = async (...args: unknown[]): Promise<unknown> => {
      if (args[0] === locked) throw new Error('permission denied');
      return Reflect.apply(actualFs.readdir, undefined, args) as Promise<unknown>;
    };
    vi.mocked(readdir).mockImplementation(deny as typeof readdir);
    await expect(discover()).resolves.toEqual(['ok.txt']);
  });
});

describe('directory prefixes', () => {
  it('returns root-relative paths unchanged for an empty prefix', async () => {
    writeFile('a.ts');
    writeFile('src/b.ts');
    await expect(discover()).resolves.toEqual(['a.ts', 'src/b.ts']);
  });

  it('lists the selected directory and prefixes its output', async () => {
    writeFile('src/commands/a.ts');
    writeFile('src/commands/b.md');
    writeFile('src/index.ts');
    const searchDir = path.join(root, 'src');
    const result = await discoverGrepCandidates(
      directoryTarget(searchDir, 'src'), 'commands/*.ts', '', new AbortController().signal,
    );
    expect(result).toEqual(['src/commands/a.ts']);
    expect(vi.mocked(listProjectFiles)).toHaveBeenCalledOnce();
    expect(vi.mocked(listProjectFiles)).toHaveBeenCalledWith(searchDir);
    expect(vi.mocked(listProjectFiles)).not.toHaveBeenCalledWith(root);
  });

  it('trusts the normalized prefix supplied by the target', async () => {
    writeFile('src/commands/a.ts');
    writeFile('src/index.ts');
    const searchDir = path.join(root, 'src');
    const result = await discoverGrepCandidates(directoryTarget(searchDir, 'src'), '', '', new AbortController().signal);
    expect(result).toEqual(['src/commands/a.ts', 'src/index.ts']);
    expect(vi.mocked(listProjectFiles)).toHaveBeenCalledWith(searchDir);
  });

  it('returns an empty array for an empty selected directory', async () => {
    mkdirSync(path.join(root, 'empty'));
    const result = await discoverGrepCandidates(
      directoryTarget(path.join(root, 'empty'), 'empty'), '', '', new AbortController().signal,
    );
    expect(result).toEqual([]);
  });
});

describe('filtering', () => {
  it('returns every listed path for empty fields', async () => {
    writeFile('a.ts');
    writeFile('sub/b.ts');
    await expect(discover()).resolves.toEqual(['a.ts', 'sub/b.ts']);
  });

  it('routes whitespace- and comma-only fields through the worker', async () => {
    writeFile('a.ts');
    writeFile('sub/b.ts');
    await expect(discover('  ', ' , ')).resolves.toEqual(['a.ts', 'sub/b.ts']);
    expect(workers.instances).toHaveLength(1);
  });

  it('reaches multiple depths with a slash-free wildcard', async () => {
    writeFile('a.ts');
    writeFile('src/b.ts');
    writeFile('c.md');
    await expect(discover('*.ts')).resolves.toEqual(['a.ts', 'src/b.ts']);
  });

  it('anchors a glob containing a slash to the listing root', async () => {
    writeFile('commands/a.ts');
    writeFile('commands/nested/b.ts');
    writeFile('other.ts');
    await expect(discover('commands/*.ts')).resolves.toEqual(['commands/a.ts']);
  });

  it('expands a plain directory name to everything beneath it', async () => {
    writeFile('commands/a.ts');
    writeFile('commands/nested/b.ts');
    writeFile('other.ts');
    await expect(discover('commands')).resolves.toEqual(['commands/a.ts', 'commands/nested/b.ts']);
  });

  it('lets exclude override include', async () => {
    writeFile('commands/a.ts');
    writeFile('commands/nested/b.ts');
    await expect(discover('commands', 'commands/nested')).resolves.toEqual(['commands/a.ts']);
  });

  it('trims comma-separated alternatives', async () => {
    writeFile('a.ts');
    writeFile('b.md');
    writeFile('c.ts');
    await expect(discover('  a.ts , b.md  ')).resolves.toEqual(['a.ts', 'b.md']);
  });

  it('normalizes a backslash to a path separator', async () => {
    writeFile('commands/a.ts');
    writeFile('commands/b.md');
    await expect(discover(String.raw`commands\*.ts`)).resolves.toEqual(['commands/a.ts']);
  });

  it('normalizes a leading ./ before anchoring', async () => {
    writeFile('commands/a.ts');
    writeFile('commands/b.md');
    await expect(discover('./commands/*.ts')).resolves.toEqual(['commands/a.ts']);
  });

  it('normalizes a trailing slash on a directory name', async () => {
    writeFile('commands/a.ts');
    writeFile('commands/nested/b.ts');
    writeFile('other.ts');
    await expect(discover('commands/')).resolves.toEqual(['commands/a.ts', 'commands/nested/b.ts']);
  });

  it('selects a literal filename with an unmatched bracket', async () => {
    writeFile('[bad');
    writeFile('a.ts');
    await expect(discover('[bad')).resolves.toEqual(['[bad']);
  });

  it('excludes a literal filename with an unmatched bracket', async () => {
    writeFile('[bad');
    writeFile('a.ts');
    await expect(discover('', '[bad')).resolves.toEqual(['a.ts']);
  });

  it('treats a brace list as comma-separated malformed patterns that select nothing', async () => {
    writeFile('a.ts');
    writeFile('b.md');
    await expect(discover('*.{ts,md}')).resolves.toEqual([]);
  });

  it('retains every file when the same brace list is excluded', async () => {
    writeFile('a.ts');
    writeFile('b.md');
    await expect(discover('', '*.{ts,md}')).resolves.toEqual(['a.ts', 'b.md']);
  });
});

describe('single-file targets', () => {
  it('selects a root file with an empty prefix', async () => {
    const file = writeFile('a.ts');
    const result = await discoverGrepCandidates(fileTarget(file, ''), '', '', new AbortController().signal);
    expect(result).toEqual(['a.ts']);
    expect(vi.mocked(listProjectFiles)).toHaveBeenCalledWith(root);
  });

  it('selects only the named basename from its parent', async () => {
    writeFile('src/a.ts');
    writeFile('src/b.ts');
    writeFile('src/sub/a.ts');
    const parent = path.join(root, 'src');
    const result = await discoverGrepCandidates(fileTarget(path.join(parent, 'a.ts'), 'src'), '', '', new AbortController().signal);
    expect(result).toEqual(['src/a.ts']);
    expect(vi.mocked(listProjectFiles)).toHaveBeenCalledOnce();
    expect(vi.mocked(listProjectFiles)).toHaveBeenCalledWith(parent);
  });

  it('omits a git-ignored named file', async () => {
    initRepo();
    writeFile('.gitignore', 'ignored.txt\n');
    commitAll();
    const ignored = writeFile('ignored.txt');
    const result = await discoverGrepCandidates(fileTarget(ignored, ''), '', '', new AbortController().signal);
    expect(result).toEqual([]);
  });

  it('accepts a basename matched by include', async () => {
    writeFile('src/a.ts');
    const file = path.join(root, 'src', 'a.ts');
    const result = await discoverGrepCandidates(fileTarget(file, 'src'), '*.ts', '', new AbortController().signal);
    expect(result).toEqual(['src/a.ts']);
  });

  it('rejects a basename unmatched by include', async () => {
    writeFile('src/a.ts');
    const file = path.join(root, 'src', 'a.ts');
    const result = await discoverGrepCandidates(fileTarget(file, 'src'), '*.md', '', new AbortController().signal);
    expect(result).toEqual([]);
  });

  it('rejects a basename matched by exclude', async () => {
    writeFile('src/a.ts');
    const file = path.join(root, 'src', 'a.ts');
    const result = await discoverGrepCandidates(fileTarget(file, 'src'), '', '*.ts', new AbortController().signal);
    expect(result).toEqual([]);
  });

  it('does not match a parent-qualified include against the basename', async () => {
    writeFile('src/a.ts');
    const file = path.join(root, 'src', 'a.ts');
    const result = await discoverGrepCandidates(fileTarget(file, 'src'), 'src/*.ts', '', new AbortController().signal);
    expect(result).toEqual([]);
  });
});

describe('candidate contracts', () => {
  it('keeps first-occurrence order while collapsing identical paths', async () => {
    vi.mocked(listProjectFiles).mockResolvedValue(['z.ts', 'dup.ts', 'a.ts', 'dup.ts', 'm.ts', 'z.ts']);
    await expect(discover('*.ts')).resolves.toEqual(['z.ts', 'dup.ts', 'a.ts', 'm.ts']);
    expect(vi.mocked(listProjectFiles)).toHaveBeenCalledOnce();
  });

  it('returns an empty array when filtering removes every path', async () => {
    vi.mocked(listProjectFiles).mockResolvedValue(['a.ts', 'b.md']);
    await expect(discover('*.rb')).resolves.toEqual([]);
  });

  it('propagates an unexpected listing rejection unchanged', async () => {
    const failure = new Error('listing failed');
    vi.mocked(listProjectFiles).mockRejectedValue(failure);
    await expect(discover()).rejects.toBe(failure);
  });
});

describe('discovery cancellation', () => {
  it('starts no listing for an initially aborted signal', async () => {
    const controller = new AbortController();
    const reason = new Error('already aborted');
    controller.abort(reason);
    await expect(discover('', '', controller.signal)).rejects.toBe(reason);
    expect(vi.mocked(listProjectFiles)).not.toHaveBeenCalled();
    expect(workers.instances).toHaveLength(0);
  });

  it('starts no worker when listing resolves after an abort', async () => {
    const listing = deferred<string[]>();
    vi.mocked(listProjectFiles).mockReturnValue(listing.promise);
    const controller = new AbortController();
    const reason = new Error('aborted while listing');
    const result = discover('*.ts', '', controller.signal);
    controller.abort(reason);
    listing.resolve(['a.ts']);
    await expect(result).rejects.toBe(reason);
    expect(workers.instances).toHaveLength(0);
  });

  it('observes a late listing rejection after an abort', async () => {
    const listing = deferred<string[]>();
    vi.mocked(listProjectFiles).mockReturnValue(listing.promise);
    const controller = new AbortController();
    const reason = new Error('aborted while listing');
    const failure = new Error('late listing failure');
    const result = discover('*.ts', '', controller.signal);
    controller.abort(reason);
    listing.reject(failure);
    await expect(result).rejects.toBe(failure);
    expect(workers.instances).toHaveLength(0);
  });

  it('starts no worker when the signal aborts between listing and filtering', async () => {
    const controller = new AbortController();
    const reason = new Error('aborted before filtering');
    vi.mocked(listProjectFiles).mockImplementation(() => {
      queueMicrotask(() => {
        controller.abort(reason);
      });
      return Promise.resolve(['a.ts']);
    });
    await expect(discover('*.ts', '', controller.signal)).rejects.toBe(reason);
    expect(workers.instances).toHaveLength(0);
  });
});
