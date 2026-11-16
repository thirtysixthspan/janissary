import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import type * as fileSystemPromises from 'node:fs/promises';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import type * as nodeOs from 'node:os';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listProjectFiles } from '../file-navigator/search.js';
import { createMatcherWorker } from '../search/matching-worker.js';
import type { GrepSearchTarget, ResolvedGrepTarget } from './path-target.js';
import { resolveGrepTarget } from './path-target.js';

const home = vi.hoisted(() => ({ dir: '' }));

vi.mock('node:os', async (importOriginal) => ({
  ...await importOriginal<typeof nodeOs>(),
  homedir: vi.fn(() => home.dir),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fileSystemPromises>();
  return {
    ...actual,
    lstat: vi.fn(actual.lstat),
    readFile: vi.fn(actual.readFile),
    readdir: vi.fn(actual.readdir),
    realpath: vi.fn(actual.realpath),
  };
});

vi.mock('../file-navigator/search.js', () => ({ listProjectFiles: vi.fn() }));
vi.mock('../search/matching-worker.js', () => ({ createMatcherWorker: vi.fn() }));

const actualFs = await vi.importActual<typeof fileSystemPromises>('node:fs/promises');

let base: string;
let homeDirectory: string;
let root: string;
let outside: string;

beforeEach(() => {
  base = realpathSync(mkdtempSync(path.join(tmpdir(), 'file-grep-path-target-')));
  homeDirectory = path.join(base, 'home');
  root = path.join(base, 'workspace');
  outside = path.join(base, 'workspace-sibling');
  mkdirSync(homeDirectory);
  mkdirSync(root);
  mkdirSync(outside);
  home.dir = homeDirectory;
  vi.mocked(lstat).mockReset().mockImplementation(actualFs.lstat);
  vi.mocked(realpath).mockReset().mockImplementation(actualFs.realpath);
});

afterEach(() => {
  expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  expect(vi.mocked(readdir)).not.toHaveBeenCalled();
  expect(vi.mocked(listProjectFiles)).not.toHaveBeenCalled();
  expect(vi.mocked(createMatcherWorker)).not.toHaveBeenCalled();
  vi.clearAllMocks();
  rmSync(base, { recursive: true, force: true });
});

function writeAt(location: string, relative: string, content = 'text\n'): string {
  const target = path.join(location, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

function resolve(requestedPath: string | undefined): Promise<ResolvedGrepTarget> {
  return resolveGrepTarget(root, requestedPath);
}

function directoryTarget(searchDir: string, prefix: string): GrepSearchTarget {
  return { kind: 'directory', root, prefix, searchDir };
}

function fileTarget(filePath: string, prefix: string): GrepSearchTarget {
  return { kind: 'file', root, prefix, filePath };
}

function expectNoTargetMetadata(): void {
  expect(vi.mocked(lstat)).not.toHaveBeenCalled();
  expect(vi.mocked(realpath)).not.toHaveBeenCalled();
}

function inspectedPaths(): string[] {
  return vi.mocked(lstat).mock.calls.map(([target]) => String(target));
}

describe('ordinary selections', () => {
  it.each([undefined, '.', './'])('selects the workspace root for %j', async (requested) => {
    expect(await resolve(requested)).toEqual(directoryTarget(root, ''));
  });

  it('selects a regular file at the root with an empty prefix', async () => {
    const target = writeAt(root, 'a.txt');
    expect(await resolve('a.txt')).toEqual(fileTarget(target, ''));
  });

  it('selects an ordinary root directory', async () => {
    mkdirSync(path.join(root, 'lib'));
    expect(await resolve('lib')).toEqual(directoryTarget(path.join(root, 'lib'), 'lib'));
  });

  it.each(['./src', 'src/', './src/'])('normalizes %j to the src prefix', async (requested) => {
    mkdirSync(path.join(root, 'src'));
    expect(await resolve(requested)).toEqual(directoryTarget(path.join(root, 'src'), 'src'));
  });
});

describe('path shapes', () => {
  it('selects a deeper directory with its normalized prefix', async () => {
    mkdirSync(path.join(root, 'src', 'deep'), { recursive: true });
    expect(await resolve('./src/deep')).toEqual(directoryTarget(path.join(root, 'src', 'deep'), 'src/deep'));
  });

  it('selects a nested file with its parent prefix', async () => {
    const target = writeAt(root, 'src/a.ts');
    expect(await resolve('./src/a.ts')).toEqual(fileTarget(target, 'src'));
  });

  it('resolves a child under a safe symlink alias supplied as root', async () => {
    writeAt(root, 'src/a.ts');
    const alias = path.join(base, 'workspace-alias');
    symlinkSync(root, alias);
    const result = await resolveGrepTarget(alias, 'src');
    expect(result).toEqual(directoryTarget(path.join(root, 'src'), 'src'));
    expect(JSON.stringify(result)).not.toContain(alias);
  });
});

describe('containment refusals', () => {
  it('refuses an absolute path inside the workspace with the typed spelling', async () => {
    const requested = path.join(root, 'a.txt');
    expect(await resolve(requested)).toEqual({ kind: 'failure', text: `Outside the workspace: ${requested}.` });
    expectNoTargetMetadata();
  });

  it('refuses an absolute path outside the workspace with the typed spelling', async () => {
    const requested = path.join(outside, 'a.txt');
    expect(await resolve(requested)).toEqual({ kind: 'failure', text: `Outside the workspace: ${requested}.` });
    expectNoTargetMetadata();
  });

  it('refuses a normalized parent escape with the typed spelling', async () => {
    const requested = 'src/../../outside';
    expect(await resolve(requested)).toEqual({ kind: 'failure', text: `Outside the workspace: ${requested}.` });
    expectNoTargetMetadata();
  });

  it('refuses a sibling whose name shares the root prefix', async () => {
    const requested = '../workspace-sibling/a.txt';
    expect(await resolve(requested)).toEqual({ kind: 'failure', text: `Outside the workspace: ${requested}.` });
    expectNoTargetMetadata();
  });
});

describe('lexical secrets', () => {
  it.each(['.env', 'nested/.env.local', '.ENV', '.config/gh/hosts.yml', '.ssh/id_rsa'])(
    'skips %j before target metadata',
    async (requested) => {
      expect(await resolve(requested)).toEqual({ kind: 'skip' });
      expectNoTargetMetadata();
    },
  );
});

describe('home-secret roots', () => {
  function literalHomeRoot(): string {
    const secretRoot = path.join(homeDirectory, '.ssh', 'workspace');
    mkdirSync(secretRoot, { recursive: true });
    return secretRoot;
  }

  function linkedHomeRoot(): string {
    const real = path.join(homeDirectory, '.ssh-real');
    mkdirSync(path.join(real, 'workspace'), { recursive: true });
    symlinkSync(real, path.join(homeDirectory, '.ssh'));
    return path.join(real, 'workspace');
  }

  it('skips the default path inside a literal home-secret anchor', async () => {
    expect(await resolveGrepTarget(literalHomeRoot(), undefined)).toEqual({ kind: 'skip' });
    expectNoTargetMetadata();
  });

  it('skips an explicit dot inside a literal home-secret anchor', async () => {
    expect(await resolveGrepTarget(literalHomeRoot(), '.')).toEqual({ kind: 'skip' });
    expectNoTargetMetadata();
  });

  it('skips the default path inside a resolved symlinked home-secret anchor', async () => {
    expect(await resolveGrepTarget(linkedHomeRoot(), undefined)).toEqual({ kind: 'skip' });
    expectNoTargetMetadata();
  });

  it('skips an explicit dot inside a resolved symlinked home-secret anchor', async () => {
    expect(await resolveGrepTarget(linkedHomeRoot(), '.')).toEqual({ kind: 'skip' });
    expectNoTargetMetadata();
  });
});

describe('links and canonical targets', () => {
  it('skips a final file link inside the root', async () => {
    symlinkSync(writeAt(root, 'target.txt'), path.join(root, 'link.txt'));
    expect(await resolve('link.txt')).toEqual({ kind: 'skip' });
  });

  it('skips a final directory link inside the root', async () => {
    mkdirSync(path.join(root, 'dir'));
    symlinkSync(path.join(root, 'dir'), path.join(root, 'link'));
    expect(await resolve('link')).toEqual({ kind: 'skip' });
  });

  it('skips an in-root ancestor link without inspecting beneath it', async () => {
    writeAt(root, 'sub/file.txt');
    symlinkSync(path.join(root, 'sub'), path.join(root, 'link'));
    expect(await resolve('link/file.txt')).toEqual({ kind: 'skip' });
    expect(inspectedPaths()).not.toContain(path.join(root, 'link', 'file.txt'));
  });

  it('reports an outside canonical target through an ancestor link', async () => {
    writeAt(outside, 'file.txt');
    symlinkSync(outside, path.join(root, 'outlink'));
    expect(await resolve('outlink/file.txt')).toEqual({ kind: 'failure', text: 'Outside the workspace: outlink/file.txt.' });
  });

  it('reports an outside canonical target through a final link', async () => {
    symlinkSync(writeAt(outside, 'file.txt'), path.join(root, 'outside.txt'));
    expect(await resolve('outside.txt')).toEqual({ kind: 'failure', text: 'Outside the workspace: outside.txt.' });
  });

  it('skips an ancestor link to its containing directory without final metadata', async () => {
    writeAt(root, 'dir/file.txt');
    symlinkSync(path.join(root, 'dir'), path.join(root, 'dir', 'self'));
    expect(await resolve('dir/self/file.txt')).toEqual({ kind: 'skip' });
    expect(inspectedPaths()).toContain(path.join(root, 'dir', 'self'));
    expect(inspectedPaths()).not.toContain(path.join(root, 'dir', 'self', 'file.txt'));
  });

  it('skips a dangling final link', async () => {
    symlinkSync(path.join(root, 'missing.txt'), path.join(root, 'dead.txt'));
    expect(await resolve('dead.txt')).toEqual({ kind: 'skip' });
  });

  it('skips a dangling ancestor link', async () => {
    symlinkSync(path.join(root, 'missing'), path.join(root, 'dead'));
    expect(await resolve('dead/file.txt')).toEqual({ kind: 'skip' });
  });

  it('skips a missing child below a live link', async () => {
    mkdirSync(path.join(root, 'sub'));
    symlinkSync(path.join(root, 'sub'), path.join(root, 'live'));
    expect(await resolve('live/missing.txt')).toEqual({ kind: 'skip' });
  });

  it('skips a canonical target mismatch with no observed link', async () => {
    writeAt(root, 'a.txt');
    writeAt(root, 'b.txt');
    vi.mocked(realpath).mockResolvedValueOnce(root).mockResolvedValueOnce(path.join(root, 'b.txt'));
    expect(await resolve('a.txt')).toEqual({ kind: 'skip' });
    expect(inspectedPaths()).toEqual([root, path.join(root, 'a.txt')]);
  });
});

describe('metadata and classification failures', () => {
  it('reports a missing ordinary target with the typed spelling', async () => {
    expect(await resolve('./missing/')).toEqual({ kind: 'failure', text: 'Path not found: ./missing/.' });
  });

  it('reports a child below an ordinary file', async () => {
    writeAt(root, 'file.txt');
    expect(await resolve('file.txt/child')).toEqual({ kind: 'failure', text: 'Path not found: file.txt/child.' });
  });

  it('skips a FIFO without opening it', async () => {
    execFileSync('mkfifo', [path.join(root, 'pipe')]);
    expect(await resolve('pipe')).toEqual({ kind: 'skip' });
  });

  it('reports a rejected root realpath', async () => {
    vi.mocked(realpath).mockRejectedValueOnce(new Error('denied'));
    expect(await resolve('src')).toEqual({ kind: 'failure', text: 'Path not found: src.' });
  });

  it('reports a rejected ancestor lstat', async () => {
    writeAt(root, 'dir/file.txt');
    vi.mocked(lstat).mockResolvedValueOnce(statSync(root)).mockRejectedValueOnce(new Error('denied'));
    expect(await resolve('dir/file.txt')).toEqual({ kind: 'failure', text: 'Path not found: dir/file.txt.' });
  });

  it('reports a rejected final lstat', async () => {
    writeAt(root, 'dir/file.txt');
    vi.mocked(lstat)
      .mockResolvedValueOnce(statSync(root))
      .mockResolvedValueOnce(statSync(path.join(root, 'dir')))
      .mockRejectedValueOnce(new Error('denied'));
    expect(await resolve('dir/file.txt')).toEqual({ kind: 'failure', text: 'Path not found: dir/file.txt.' });
  });

  it('reports a rejected target realpath', async () => {
    writeAt(root, 'a.txt');
    vi.mocked(realpath).mockResolvedValueOnce(root).mockRejectedValueOnce(new Error('denied'));
    expect(await resolve('a.txt')).toEqual({ kind: 'failure', text: 'Path not found: a.txt.' });
  });

  it('reports a supplied root that is an ordinary file', async () => {
    const fileRoot = path.join(base, 'root-file');
    writeFileSync(fileRoot, 'text\n');
    expect(await resolveGrepTarget(fileRoot, 'child.txt')).toEqual({ kind: 'failure', text: 'Path not found: child.txt.' });
  });
});
