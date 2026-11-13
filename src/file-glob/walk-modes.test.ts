import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { walkGlob, type GlobWalkOptions } from './walk.js';

function write(root: string, relative: string, content = 'x'): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

describe('walkGlob modes', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'file-glob-walk-')); });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  function walk(overrides: Partial<GlobWalkOptions> = {}): ReturnType<typeof walkGlob> {
    return walkGlob({
      root, start: root, pattern: '**/*', hidden: false, dirs: false, limit: 100, deadline: Date.now() + 60_000, ignored: new Set(), ...overrides,
    });
  }

  async function listed(overrides: Partial<GlobWalkOptions> = {}): Promise<string[]> {
    const result = await walk(overrides);
    return result.paths;
  }

  it('lists directories in pre-order under dirs', async () => {
    mkdirSync(path.join(root, 'a/b'), { recursive: true });
    mkdirSync(path.join(root, 'a-b'));
    expect(await listed({ dirs: true })).toEqual(['a/', 'a/b/', 'a-b/']);
  });

  it('lists directories with a trailing slash, empty ones included, and no files under dirs', async () => {
    write(root, 'src/a.ts');
    write(root, 'src/x/b.ts');
    mkdirSync(path.join(root, 'empty'));
    write(root, 'top.ts');
    expect(await listed({ dirs: true })).toEqual(['empty/', 'src/', 'src/x/']);
  });

  it('never lists the start directory under dirs', async () => {
    mkdirSync(path.join(root, 'src/x/y'), { recursive: true });
    mkdirSync(path.join(root, 'src/z'));
    expect(await listed({ dirs: true, start: path.join(root, 'src') })).toEqual(['src/x/', 'src/x/y/', 'src/z/']);
  });

  it('never lists .git under dirs, as a directory or a file, with or without hidden', async () => {
    write(root, '.git/HEAD');
    write(root, 'sub/.git');
    mkdirSync(path.join(root, 'sub/.git-dir'));
    expect(await listed({ dirs: true })).toEqual(['sub/']);
    expect(await listed({ dirs: true, hidden: true })).toEqual(['sub/', 'sub/.git-dir/']);
  });

  it('terminates on a symbolic link cycle and does not list it in either mode', async () => {
    write(root, 'a/x');
    symlinkSync('..', path.join(root, 'a/loop'));
    expect(await walk()).toEqual({ paths: ['a/x'], truncated: false, timedOut: false });
    expect(await walk({ dirs: true })).toEqual({ paths: ['a/'], truncated: false, timedOut: false });
  });

  it('lists a symbolic link to a file in file mode only', async () => {
    write(root, 'real.ts');
    symlinkSync('real.ts', path.join(root, 'link.ts'));
    expect(await listed()).toEqual(['link.ts', 'real.ts']);
    expect(await listed({ dirs: true })).toEqual([]);
  });

  it('omits a symbolic link to a secret file and does not count it toward the limit', async () => {
    write(root, '.env');
    write(root, 'a');
    symlinkSync('.env', path.join(root, 'notes.txt'));
    expect(await walk({ limit: 1 })).toEqual({ paths: ['a'], truncated: false, timedOut: false });
  });

  it('omits a symbolic link to a file outside the root', async () => {
    const outside = mkdtempSync(path.join(tmpdir(), 'file-glob-outside-'));
    try {
      write(outside, 'target.ts');
      write(root, 'keep.ts');
      symlinkSync(path.join(outside, 'target.ts'), path.join(root, 'out.ts'));
      expect(await listed()).toEqual(['keep.ts']);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('skips a broken symbolic link in both modes', async () => {
    write(root, 'a.ts');
    symlinkSync('missing', path.join(root, 'broken'));
    expect(await listed()).toEqual(['a.ts']);
    expect(await listed({ dirs: true })).toEqual([]);
  });

  it('omits secret files under hidden', async () => {
    for (const file of ['.env', '.env.local', '.env.example', '.aws/credentials', 'keep.ts']) write(root, file);
    expect(await listed({ hidden: true })).toEqual(['keep.ts']);
  });

  it('does not count a secret file toward the limit', async () => {
    write(root, '.env');
    write(root, 'a');
    expect(await walk({ hidden: true, limit: 1 })).toEqual({ paths: ['a'], truncated: false, timedOut: false });
  });

  it('omits .aws/ under dirs and hidden', async () => {
    write(root, '.aws/credentials');
    mkdirSync(path.join(root, '.aws/sso'));
    mkdirSync(path.join(root, 'keep'));
    expect(await listed({ dirs: true, hidden: true })).toEqual(['keep/']);
  });

  it('times out at once for a deadline that has already passed', async () => {
    write(root, 'a');
    expect(await walk({ deadline: 0 })).toEqual({ paths: [], truncated: false, timedOut: true });
  });

  it('stops at a deadline that passes mid-walk', async () => {
    write(root, 'a');
    write(root, 'b/x');
    const options: GlobWalkOptions = {
      root, start: root, pattern: '**/*', hidden: false, dirs: false, limit: 100, deadline: 1, ignored: new Set(),
    };
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(2);
    expect(await walkGlob(options)).toEqual({ paths: ['a'], truncated: false, timedOut: true });
  });
});
