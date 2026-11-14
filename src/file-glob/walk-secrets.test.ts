import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fileSystem from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { walkGlob, type GlobWalkOptions } from './walk.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fileSystem>();
  return { ...actual, realpathSync: vi.fn(actual.realpathSync) };
});

function write(base: string, relative: string): void {
  const target = path.join(base, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, 'x');
}

describe('walkGlob secret check', () => {
  let home: string;
  let root: string;

  beforeEach(() => {
    home = fileSystem.realpathSync(mkdtempSync(path.join(tmpdir(), 'file-glob-home-')));
    root = fileSystem.realpathSync(mkdtempSync(path.join(tmpdir(), 'file-glob-secret-root-')));
    vi.stubEnv('HOME', home);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  });

  function walk(overrides: Partial<GlobWalkOptions> = {}): ReturnType<typeof walkGlob> {
    return walkGlob({
      root, start: root, pattern: '**/*', hidden: false, dirs: false, limit: 1000, deadline: Date.now() + 60_000, ignored: new Set(), ...overrides,
    });
  }

  async function listed(overrides: Partial<GlobWalkOptions>): Promise<string[]> {
    const result = await walk(overrides);
    return result.paths;
  }

  async function realpathCallsFor(count: number): Promise<number> {
    for (let index = 0; index < count; index += 1) write(root, `f${String(index)}.ts`);
    vi.mocked(fileSystem.realpathSync).mockClear();
    const result = await walk();
    expect(result.paths).toHaveLength(count);
    return vi.mocked(fileSystem.realpathSync).mock.calls.length;
  }

  it('makes no realpathSync call per match', async () => {
    const few = await realpathCallsFor(2);
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root);
    expect(await realpathCallsFor(40)).toBe(few);
  });

  it('omits a match whose real location is under a home secret entry reached through a link', async () => {
    write(home, 'aws-real/credentials');
    write(home, 'keep.ts');
    symlinkSync(path.join(home, 'aws-real'), path.join(home, '.aws'));
    expect(await listed({ root: home, start: home })).toEqual(['keep.ts']);
  });

  it('lists nothing in a workspace that is the home .ssh directory', async () => {
    write(home, '.ssh/id_rsa');
    write(home, '.ssh/config');
    const ssh = path.join(home, '.ssh');
    expect(await listed({ root: ssh, start: ssh })).toEqual([]);
  });

  it('omits an in-root link to a file inside a home secret target', async () => {
    write(home, 'aws-real/credentials');
    write(home, 'keep.ts');
    symlinkSync(path.join(home, 'aws-real'), path.join(home, '.aws'));
    symlinkSync(path.join(home, 'aws-real/credentials'), path.join(home, 'notes.txt'));
    expect(await listed({ root: home, start: home, pattern: '*' })).toEqual(['keep.ts']);
  });
});
