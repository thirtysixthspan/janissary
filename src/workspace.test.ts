import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { findRepoRoot, initWorkspaceDir, createWorkspace, removeWorkspace, clearWorkspaceDir } from './workspace.js';

let tmpDir: string;
let repoDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'workspace-test-'));
  repoDir = join(tmpDir, 'repo');
  mkdirSync(repoDir, { recursive: true });
  execSync('git init', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.email test@test.com', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.name test', { cwd: repoDir, stdio: 'pipe' });
  writeFileSync(join(repoDir, 'README.md'), '# Test Repo');
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
    const sub = join(repoDir, 'a', 'b', 'c');
    mkdirSync(sub, { recursive: true });
    expect(findRepoRoot(sub)).toBe(repoDir);
  });

  it('returns null when no .git is found', () => {
    expect(findRepoRoot(tmpDir)).toBeNull();
  });
});

describe('createWorkspace', () => {
  it('creates a git clone --shared of the repo', () => {
    const ws = createWorkspace('test-agent', repoDir);
    expect(existsSync(ws)).toBe(true);
    expect(existsSync(join(ws, '.git'))).toBe(true);
    expect(existsSync(join(ws, 'README.md'))).toBe(true);
    removeWorkspace(ws);
  });
});

describe('clearWorkspaceDir', () => {
  it('removes all workspaces', () => {
    createWorkspace('agent-a', repoDir);
    createWorkspace('agent-b', repoDir);
    clearWorkspaceDir();
    expect(existsSync(join(tmpDir, '.janussary', 'workspace', 'agent-a'))).toBe(false);
    expect(existsSync(join(tmpDir, '.janussary', 'workspace', 'agent-b'))).toBe(false);
  });
});
