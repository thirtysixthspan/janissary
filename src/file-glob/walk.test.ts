import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync, symlinkSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import type * as FileSystemPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { walkGlob, type GlobWalkOptions } from './walk.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystemPromises>();
  return { ...actual, readdir: vi.fn(actual.readdir) };
});

function write(root: string, relative: string, content = 'x'): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

describe('walkGlob', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'file-glob-walk-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  function walk(overrides: Partial<GlobWalkOptions> = {}): ReturnType<typeof walkGlob> {
    return walkGlob({ root, start: root, pattern: '**/*', hidden: false, dirs: false, limit: 100, deadline: Date.now() + 60_000, ignored: new Set(), ...overrides });
  }

  async function listed(overrides: Partial<GlobWalkOptions> = {}): Promise<string[]> {
    const result = await walk(overrides);
    return result.paths;
  }

  it('lists matches in sorted depth-first code-unit order', async () => {
    for (const file of ['a-b/x', 'a/x', 'a/y/z', 'B.ts', 'a.ts']) write(root, file);
    const result = await walk();
    expect(result).toEqual({ paths: ['B.ts', 'a/x', 'a/y/z', 'a-b/x', 'a.ts'], truncated: false, timedOut: false });
  });

  it('anchors the pattern at the start directory and prints root-relative paths', async () => {
    write(root, 'src/a.ts');
    write(root, 'src/x/b.ts');
    write(root, 'c.ts');
    const result = await walk({ start: path.join(root, 'src'), pattern: '*.ts' });
    expect(result.paths).toEqual(['src/a.ts']);
  });

  it('prunes dot entries and node_modules without hidden and lists them with it', async () => {
    for (const file of ['.eslintrc.json', '.github/ci.yml', 'node_modules/p/i.js', 'pkg/node_modules/q/j.js', 'pkg/k.js']) {
      write(root, file);
    }
    expect(await listed()).toEqual(['pkg/k.js']);
    expect(await listed({ hidden: true })).toEqual([
      '.eslintrc.json', '.github/ci.yml', 'node_modules/p/i.js', 'pkg/k.js', 'pkg/node_modules/q/j.js',
    ]);
  });

  it('prunes ignored files and directories by exact path without visiting them', async () => {
    for (const file of ['dist/x.ts', 'dist-old/x.ts', 'a.log', 'keep.ts']) write(root, file);
    const result = await walk({ ignored: new Set(['dist', 'a.log']) });
    expect(result.paths).toEqual(['dist-old/x.ts', 'keep.ts']);
  });

  it('looks up ignored paths relative to the root when start is below it', async () => {
    for (const file of ['src/gen/out.ts', 'src/keep.ts', 'gen/out.ts']) write(root, file);
    const start = path.join(root, 'src');
    expect(await listed({ start, ignored: new Set(['src/gen']) })).toEqual(['src/keep.ts']);
    expect(await listed({ start, ignored: new Set(['gen']) })).toEqual(['src/gen/out.ts', 'src/keep.ts']);
  });

  it('looks up ignored paths by their real location under a linked start', async () => {
    for (const file of ['src/gen/out.ts', 'src/keep.ts']) write(root, file);
    symlinkSync('src', path.join(root, 'lnk'));
    const linked = { start: path.join(root, 'lnk'), realStart: 'src', ignored: new Set(['src/gen']) };
    expect(await listed(linked)).toEqual(['lnk/keep.ts']);
    expect(await listed({ ...linked, hidden: true })).toEqual(['lnk/gen/out.ts', 'lnk/keep.ts']);
  });

  it('does not consult the ignored set under hidden', async () => {
    write(root, 'dist/x.ts');
    write(root, 'a.log');
    const result = await walk({ hidden: true, ignored: new Set(['dist', 'a.log']) });
    expect(result.paths).toEqual(['a.log', 'dist/x.ts']);
  });

  it('lists the contents of a start directory that is a dot-directory or ignored', async () => {
    write(root, '.github/ci.yml');
    write(root, 'dist/x.ts');
    const dot = await walk({ start: path.join(root, '.github') });
    expect(dot.paths).toEqual(['.github/ci.yml']);
    const ignored = await walk({ start: path.join(root, 'dist'), ignored: new Set(['dist']) });
    expect(ignored.paths).toEqual(['dist/x.ts']);
  });

  it('never lists .git, as a directory or a file, with or without hidden', async () => {
    write(root, '.git/HEAD');
    write(root, 'sub/.git');
    write(root, 'sub/a.ts');
    expect(await listed()).toEqual(['sub/a.ts']);
    expect(await listed({ hidden: true })).toEqual(['sub/a.ts']);
  });

  it('truncates at limit + 1 matches', async () => {
    for (const file of ['a', 'b', 'c']) write(root, file);
    expect(await walk({ limit: 2 })).toEqual({ paths: ['a', 'b'], truncated: true, timedOut: false });
  });

  it('does not truncate at exactly limit matches', async () => {
    for (const file of ['a', 'b']) write(root, file);
    expect(await walk({ limit: 2 })).toEqual({ paths: ['a', 'b'], truncated: false, timedOut: false });
  });

  it('stops reading directories once it holds limit + 1 matches', async () => {
    for (const file of ['a', 'b', 'c/x', 'd/y']) write(root, file);
    vi.mocked(readdir).mockClear();
    expect(await walk({ limit: 1 })).toEqual({ paths: ['a'], truncated: true, timedOut: false });
    expect(vi.mocked(readdir).mock.calls.map(([dir]) => dir)).toEqual([root]);
  });

  it('stops reading directories once its signal is aborted, without timing out', async () => {
    for (const file of ['a/x', 'b/y', 'c/z']) write(root, file);
    const controller = new AbortController();
    const actual = await vi.importActual<typeof FileSystemPromises>('node:fs/promises');
    vi.mocked(readdir).mockClear();
    vi.mocked(readdir).mockImplementationOnce(((dir: string, options: { withFileTypes: true }) => {
      controller.abort();
      return actual.readdir(dir, options);
    }) as unknown as typeof readdir);
    expect(await walk({ signal: controller.signal })).toEqual({ paths: [], truncated: false, timedOut: false });
    expect(vi.mocked(readdir).mock.calls.map(([dir]) => dir)).toEqual([root]);
  });

  it('reads no directory when its signal is already aborted', async () => {
    write(root, 'a');
    vi.mocked(readdir).mockClear();
    expect(await walk({ signal: AbortSignal.abort() })).toEqual({ paths: [], truncated: false, timedOut: false });
    expect(vi.mocked(readdir)).not.toHaveBeenCalled();
  });

  it.skipIf(typeof process.getuid === 'function' && process.getuid() === 0)('skips an unreadable directory and keeps walking its siblings', async () => {
    write(root, 'a/x');
    write(root, 'b/locked/y');
    write(root, 'c/z');
    const locked = path.join(root, 'b/locked');
    chmodSync(locked, 0o000);
    try {
      expect(await listed()).toEqual(['a/x', 'c/z']);
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  it('yields nothing for a start directory that does not exist', async () => {
    expect(await walk({ start: path.join(root, 'missing') })).toEqual({ paths: [], truncated: false, timedOut: false });
  });

  it('yields nothing for a root that no longer exists', async () => {
    const gone = mkdtempSync(path.join(tmpdir(), 'file-glob-walk-gone-'));
    rmSync(gone, { recursive: true, force: true });
    expect(await walk({ root: gone, start: gone })).toEqual({ paths: [], truncated: false, timedOut: false });
  });
});
