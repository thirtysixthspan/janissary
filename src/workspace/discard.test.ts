import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import type * as Fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initWorkspaceDir, workspacePath } from './index.js';
import { discardDirectory, emptyWorkspaceTrash, workspaceTrashDir } from './discard.js';

const rename = vi.hoisted(() => ({ fail: undefined as string | undefined }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return {
    ...actual,
    renameSync: (from: Fs.PathLike, to: Fs.PathLike) => {
      if (rename.fail === undefined) { actual.renameSync(from, to); return; }
      throw Object.assign(new Error(rename.fail), { code: rename.fail });
    },
  };
});

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'discard-'));
  initWorkspaceDir(root, path.join(root, '.claude.json'));
  mkdirSync(workspacePath('foo'), { recursive: true });
  writeFileSync(path.join(workspacePath('foo'), 'file.txt'), 'work');
});

afterEach(() => {
  rename.fail = undefined;
  rmSync(root, { recursive: true, force: true });
});

describe('discardDirectory', () => {
  it('moves the folder into the trash, which emptyWorkspaceTrash then empties', async () => {
    discardDirectory(workspacePath('foo'));
    expect(existsSync(workspacePath('foo'))).toBe(false);
    expect(readdirSync(workspaceTrashDir())).toHaveLength(1);
    await emptyWorkspaceTrash();
    expect(readdirSync(workspaceTrashDir())).toHaveLength(0);
  });

  it('deletes in place when the trash is on another filesystem', () => {
    rename.fail = 'EXDEV';
    discardDirectory(workspacePath('foo'));
    expect(existsSync(workspacePath('foo'))).toBe(false);
    expect(readdirSync(workspaceTrashDir())).toHaveLength(0);
  });

  it('throws any other rename failure and leaves the folder where it was', () => {
    rename.fail = 'EACCES';
    expect(() => { discardDirectory(workspacePath('foo')); }).toThrow('EACCES');
    expect(existsSync(path.join(workspacePath('foo'), 'file.txt'))).toBe(true);
  });

  it('is a no-op for a folder that is not there', () => {
    expect(() => { discardDirectory(workspacePath('missing')); }).not.toThrow();
  });
});
