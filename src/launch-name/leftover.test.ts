import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initWorkspaceDir, workspacePath } from '../workspace/index.js';
import { hasLeftoverWorkspace, isWorkspaceRunning, removeLeftoverWorkspace } from './leftover.js';

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

  it('is a no-op when there is nothing to remove', () => {
    expect(removeLeftoverWorkspace('foo')).toBeUndefined();
  });

  it('returns the error text when the removal fails', () => {
    mkdirSync(path.join(workspacePath('foo'), 'nested'), { recursive: true });
    chmodSync(path.join(root, '.janissary', 'workspace'), 0o500);
    const failure = removeLeftoverWorkspace('foo');
    expect(failure).toMatch(/EACCES|EPERM|permission/i);
  });
});
