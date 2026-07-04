import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { findRepoRoot, initWorkspaceDir, createWorkspace, removeWorkspace, clearWorkspaceDir, workspaceTempPath } from './workspace.js';

let tmpDir: string;
let repoDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'workspace-test-'));
  repoDir = path.join(tmpDir, 'repo');
  mkdirSync(repoDir, { recursive: true });
  execSync('git init', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.email test@test.com', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.name test', { cwd: repoDir, stdio: 'pipe' });
  writeFileSync(path.join(repoDir, 'README.md'), '# Test Repo');
  execSync('git add . && git commit -m "init"', { cwd: repoDir, stdio: 'pipe' });
  initWorkspaceDir(tmpDir);
});

afterAll(() => {
  removeWorkspace(tmpDir);
});

describe('findRepoRoot', () => {
  it('finds root from within the repo', () => {
    expect(findRepoRoot(repoDir)).toBe(repoDir);
  });

  it('finds root from a subdirectory', () => {
    const sub = path.join(repoDir, 'a', 'b', 'c');
    mkdirSync(sub, { recursive: true });
    expect(findRepoRoot(sub)).toBe(repoDir);
  });

  it('returns undefined when no .git is found', () => {
    expect(findRepoRoot(tmpDir)).toBeUndefined();
  });
});

describe('createWorkspace', () => {
  it('creates a git clone --shared of the repo', () => {
    const ws = createWorkspace('test-agent', repoDir);
    expect(existsSync(ws)).toBe(true);
    expect(existsSync(path.join(ws, '.git'))).toBe(true);
    expect(existsSync(path.join(ws, 'README.md'))).toBe(true);
    removeWorkspace(ws);
  });

  it('also creates a sibling .tmp scratch dir', () => {
    const ws = createWorkspace('test-agent-tmp', repoDir);
    expect(existsSync(workspaceTempPath('test-agent-tmp'))).toBe(true);
    removeWorkspace(ws);
  });
});

describe('removeWorkspace', () => {
  it('removes the sibling .tmp scratch dir along with the clone', () => {
    const ws = createWorkspace('test-agent-cleanup', repoDir);
    const tmp = workspaceTempPath('test-agent-cleanup');
    expect(existsSync(tmp)).toBe(true);
    removeWorkspace(ws);
    expect(existsSync(ws)).toBe(false);
    expect(existsSync(tmp)).toBe(false);
  });
});

describe('clearWorkspaceDir', () => {
  it('removes all workspaces', () => {
    createWorkspace('agent-a', repoDir);
    createWorkspace('agent-b', repoDir);
    clearWorkspaceDir();
    expect(existsSync(path.join(tmpDir, '.janissary', 'workspace', 'agent-a'))).toBe(false);
    expect(existsSync(path.join(tmpDir, '.janissary', 'workspace', 'agent-b'))).toBe(false);
  });
});
