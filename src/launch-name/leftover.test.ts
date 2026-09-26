import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type * as Workspace from '../workspace/index.js';
import { initWorkspaceDir, untrustWorkspace, workspacePath } from '../workspace/index.js';
import { hasLeftoverWorkspace, isWorkspaceRunning, removeLeftoverWorkspace } from './leftover.js';

// The trust-file update is stubbed so no test reaches the real home directory's Claude config, and
// so one test can make it fail.
vi.mock('../workspace/index.js', async (importOriginal) => ({
  ...await importOriginal<typeof Workspace>(),
  untrustWorkspace: vi.fn(),
}));

// A pid far above any real one, so the liveness probe answers "dead".
const DEAD_PID = 99_999_999;

let root: string;

function writePeerRecord(name: string, record: Record<string, unknown>): void {
  const dir = path.join(root, '.janissary', 'remote');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(record));
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'launch-name-'));
  initWorkspaceDir(root, path.join(root, '.claude.json'));
});

afterEach(() => {
  const base = path.join(root, '.janissary', 'workspace');
  if (existsSync(base)) chmodSync(base, 0o755);
  rmSync(root, { recursive: true, force: true });
});

describe('isWorkspaceRunning', () => {
  beforeEach(() => { mkdirSync(workspacePath('foo'), { recursive: true }); });

  it('is true for a labeled peer record whose pid is alive', () => {
    writePeerRecord('s1', { pid: process.pid, socket: '/tmp/x.sock', label: 'foo' });
    expect(isWorkspaceRunning('foo', () => false)).toBe(true);
  });

  it('is true for a live peer record whose label differs only by case', () => {
    writePeerRecord('s1', { pid: process.pid, socket: '/tmp/x.sock', label: 'foo' });
    expect(isWorkspaceRunning('Foo', () => false)).toBe(true);
  });

  it('is false for a labeled peer record whose pid is dead', () => {
    writePeerRecord('s1', { pid: DEAD_PID, socket: '/tmp/x.sock', label: 'foo' });
    expect(isWorkspaceRunning('foo', () => false)).toBe(false);
  });

  it('is false for a live peer record carrying another label, or none', () => {
    writePeerRecord('s1', { pid: process.pid, socket: '/tmp/x.sock', label: 'bar' });
    writePeerRecord('s2', { pid: process.pid, socket: '/tmp/y.sock' });
    expect(isWorkspaceRunning('foo', () => false)).toBe(false);
  });

  it('is true for a janus instance lock inside the workspace held by a live process', () => {
    mkdirSync(path.join(workspacePath('foo'), '.janissary'), { recursive: true });
    writeFileSync(path.join(workspacePath('foo'), '.janissary', 'lock'), String(process.pid));
    expect(isWorkspaceRunning('foo', () => false)).toBe(true);
  });

  it('is false for a lock left by a dead process', () => {
    mkdirSync(path.join(workspacePath('foo'), '.janissary'), { recursive: true });
    writeFileSync(path.join(workspacePath('foo'), '.janissary', 'lock'), String(DEAD_PID));
    expect(isWorkspaceRunning('foo', () => false)).toBe(false);
  });

  it('asks the tab predicate about the workspace path', () => {
    expect(isWorkspaceRunning('foo', (dir) => dir === workspacePath('foo'))).toBe(true);
  });

  it('is false with no record, no lock, and no tab', () => {
    expect(isWorkspaceRunning('foo', () => false)).toBe(false);
  });
});

describe('removeLeftoverWorkspace', () => {
  it('removes the folder and its .tmp sibling', () => {
    mkdirSync(workspacePath('foo'), { recursive: true });
    writeFileSync(path.join(workspacePath('foo'), 'uncommitted.txt'), 'work');
    mkdirSync(`${workspacePath('foo')}.tmp`, { recursive: true });
    expect(hasLeftoverWorkspace('foo')).toBe(true);
    expect(removeLeftoverWorkspace('foo')).toBeUndefined();
    expect(existsSync(workspacePath('foo'))).toBe(false);
    expect(existsSync(`${workspacePath('foo')}.tmp`)).toBe(false);
    expect(hasLeftoverWorkspace('foo')).toBe(false);
  });

  it('untrusts the folder in the Claude configuration given to initWorkspaceDir', () => {
    mkdirSync(workspacePath('foo'), { recursive: true });
    expect(removeLeftoverWorkspace('foo')).toBeUndefined();
    expect(untrustWorkspace).toHaveBeenCalledWith(workspacePath('foo'), path.join(root, '.claude.json'));
  });

  it('is a no-op when there is nothing to remove', () => {
    expect(removeLeftoverWorkspace('foo')).toBeUndefined();
  });

  it('refuses a label that climbs out of the workspace base, leaving the folder there intact', () => {
    const sentinel = path.join(root, '.janissary', 'sentinel');
    mkdirSync(sentinel, { recursive: true });
    writeFileSync(path.join(sentinel, 'keep.txt'), 'keep');
    mkdirSync(workspacePath('foo'), { recursive: true });

    expect(hasLeftoverWorkspace('../sentinel')).toBe(false);
    expect(removeLeftoverWorkspace('../sentinel')).toMatch(/single folder name/);
    expect(removeLeftoverWorkspace('foo/../../sentinel')).toMatch(/single folder name/);
    expect(existsSync(path.join(sentinel, 'keep.txt'))).toBe(true);
  });

  it('returns the trust-file error and leaves the folder untouched when untrusting fails', () => {
    mkdirSync(workspacePath('foo'), { recursive: true });
    writeFileSync(path.join(workspacePath('foo'), 'uncommitted.txt'), 'work');
    vi.mocked(untrustWorkspace).mockImplementationOnce(() => { throw new Error('EACCES: permission denied, open .claude.json'); });

    expect(removeLeftoverWorkspace('foo')).toBe('EACCES: permission denied, open .claude.json');
    expect(existsSync(path.join(workspacePath('foo'), 'uncommitted.txt'))).toBe(true);
  });

  it('returns the error text when the removal fails', () => {
    mkdirSync(path.join(workspacePath('foo'), 'nested'), { recursive: true });
    chmodSync(path.join(root, '.janissary', 'workspace'), 0o500);
    const failure = removeLeftoverWorkspace('foo');
    expect(failure).toMatch(/EACCES|EPERM|permission/i);
  });
});
