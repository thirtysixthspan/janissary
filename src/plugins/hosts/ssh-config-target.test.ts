import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveSshConfigTarget } from './ssh-config-target.js';

type Scratch = { base: string; home: string; root: string; workspace: string; cwd: string };

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  scratch.length = 0;
});

function directories(): Scratch {
  const base = mkdtempSync(path.join(tmpdir(), 'janus-ssh-target-'));
  scratch.push(base);
  const root = path.join(base, 'project');
  const home = path.join(base, 'home');
  const workspace = path.join(root, '.janissary', 'workspace');
  const cwd = path.join(root, 'tab-cwd');
  mkdirSync(home, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  return { base, home, root, workspace, cwd };
}

function write(file: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, '');
}

function resolve(dirs: Scratch, operand: string) {
  return resolveSshConfigTarget(dirs.root, dirs.home, dirs.workspace, dirs.cwd, operand);
}

describe('resolveSshConfigTarget', () => {
  it('expands ~ and ~/ and $HOME/ under the home directory', () => {
    const dirs = directories();
    write(path.join(dirs.home, 'notes'));

    expect(resolve(dirs, '~').path).toBe(dirs.home);
    expect(resolve(dirs, '~/notes').path).toBe(path.join(dirs.home, 'notes'));
    expect(resolve(dirs, '$HOME/notes').path).toBe(path.join(dirs.home, 'notes'));
  });

  it('leaves a ~user form to relative lookup', () => {
    const dirs = directories();
    const userPath = path.join(dirs.cwd, '~user');
    write(userPath);

    expect(resolve(dirs, '~user').path).toBe(userPath);
  });

  it('expands bare and subpath $root and $workspace operands', () => {
    const dirs = directories();
    expect(dirs.workspace).toBe(path.join(dirs.root, '.janissary', 'workspace'));

    expect(resolve(dirs, '$root').path).toBe(dirs.root);
    expect(resolve(dirs, '$root/notes').path).toBe(path.join(dirs.root, 'notes'));
    expect(resolve(dirs, '$workspace').path).toBe(dirs.workspace);
    expect(resolve(dirs, '$workspace/notes').path).toBe(path.join(dirs.workspace, 'notes'));
  });

  it('uses an absolute operand as given without consulting cwd or root', () => {
    const dirs = directories();
    write(path.join(dirs.cwd, 'config'));
    write(path.join(dirs.root, 'config'));
    const absolute = path.join(dirs.base, 'config');

    expect(resolve(dirs, absolute)).toEqual({ path: absolute, display: absolute });
  });

  it('treats near-miss prefixes as relative operands', () => {
    const dirs = directories();
    write(path.join(dirs.cwd, '$rootnote'));
    write(path.join(dirs.cwd, '$workspace-2'));

    expect(resolve(dirs, '$rootnote').path).toBe(path.join(dirs.cwd, '$rootnote'));
    expect(resolve(dirs, '$workspace-2').path).toBe(path.join(dirs.cwd, '$workspace-2'));
  });

  it('does not fall back from an expanded prefix to cwd or root', () => {
    const dirs = directories();
    write(path.join(dirs.cwd, 'notes'));

    expect(resolve(dirs, '$HOME/notes').path).toBe(path.join(dirs.home, 'notes'));
    expect(existsSync(path.join(dirs.home, 'notes'))).toBe(false);
  });

  it('picks the cwd copy when a relative operand exists in both bases', () => {
    const dirs = directories();
    write(path.join(dirs.cwd, 'shared'));
    write(path.join(dirs.root, 'shared'));

    expect(resolve(dirs, 'shared').path).toBe(path.join(dirs.cwd, 'shared'));
  });

  it('picks the root copy when the cwd copy is absent', () => {
    const dirs = directories();
    write(path.join(dirs.root, 'shared'));

    expect(resolve(dirs, 'shared').path).toBe(path.join(dirs.root, 'shared'));
  });

  it('uses the cwd path when a relative operand exists in neither base', () => {
    const dirs = directories();

    const target = resolve(dirs, 'new-config');
    expect(target.path).toBe(path.join(dirs.cwd, 'new-config'));
    expect(existsSync(target.path)).toBe(false);
  });

  it('counts a directory at the first candidate as present', () => {
    const dirs = directories();
    mkdirSync(path.join(dirs.cwd, 'config'));
    write(path.join(dirs.root, 'config'));

    expect(resolve(dirs, 'config').path).toBe(path.join(dirs.cwd, 'config'));
  });

  it('abbreviates home paths with ~ and project paths with $root', () => {
    const dirs = directories();

    expect(resolve(dirs, '~').display).toBe('~');
    expect(resolve(dirs, '~/notes').display).toBe('~/notes');
    expect(resolve(dirs, '$root/notes').display).toBe('$root/notes');
    expect(resolve(dirs, '$root').display).toBe('$root/');
  });

  it('abbreviates workspace paths under $root/workspace rather than as $workspace', () => {
    const dirs = directories();

    expect(resolve(dirs, '$workspace').display).toBe('$root/workspace');
    expect(resolve(dirs, '$workspace/notes').display).toBe('$root/workspace/notes');
  });

  it('abbreviates a relative cwd path under the project root', () => {
    const dirs = directories();

    expect(resolve(dirs, 'new-config').display).toBe('$root/tab-cwd/new-config');
  });
});
