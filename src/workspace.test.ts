import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { findRepoRoot, initWorkspaceDir, createWorkspace, removeWorkspace, clearWorkspaceDir, workspaceTempPath, getRemoteUrl, toHttpsUrl } from './workspace.js';

let tmpDir: string;
let repoDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'workspace-test-'));
  const originDir = path.join(tmpDir, 'origin.git');
  mkdirSync(originDir, { recursive: true });
  execSync('git init --bare', { cwd: originDir, stdio: 'pipe' });
  repoDir = path.join(tmpDir, 'repo');
  mkdirSync(repoDir, { recursive: true });
  execSync('git init', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.email test@test.com', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.name test', { cwd: repoDir, stdio: 'pipe' });
  writeFileSync(path.join(repoDir, 'README.md'), '# Test Repo');
  execSync('git add . && git commit -m "init"', { cwd: repoDir, stdio: 'pipe' });
  execSync(`git remote add origin "${originDir}"`, { cwd: repoDir, stdio: 'pipe' });
  execSync('git push origin HEAD', { cwd: repoDir, stdio: 'pipe' });
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

  // 'returns undefined when no .git is found' lives in workspace-repo-root.unsandboxed.test.ts —
  // it assumes os.tmpdir() has no .git ancestor, which is false whenever the test runner itself
  // is executing inside a sandboxed workspace (TMPDIR is overridden to a path nested inside the
  // parent repo's own git tree).
});

describe('createWorkspace', () => {
  it('creates an independent clone of the repo\'s origin remote', () => {
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

  it('sets a local credential helper on the clone', () => {
    const ws = createWorkspace('test-agent-credhelper', repoDir);
    const helper = execSync('git config --local credential.helper', { cwd: ws, stdio: 'pipe' }).toString().trim();
    expect(helper).toBe('!gh auth git-credential');
    removeWorkspace(ws);
  });

  it('clones from the origin\'s original url, then rewrites the workspace\'s own origin to https', () => {
    // The clone itself must use whatever transport already works on the host (unsandboxed) — only
    // the resulting workspace's origin is switched to https, for later in-sandbox git operations.
    const ws = createWorkspace('test-agent-origin-rewrite', repoDir);
    const wsOrigin = execSync('git remote get-url origin', { cwd: ws, stdio: 'pipe' }).toString().trim();
    expect(wsOrigin).toBe(toHttpsUrl(getRemoteUrl(repoDir)));
    removeWorkspace(ws);
  });
});

describe('toHttpsUrl', () => {
  it('converts an scp-style ssh url to https', () => {
    expect(toHttpsUrl('git@github.com:owner/repo.git')).toBe('https://github.com/owner/repo.git');
  });

  it('converts an ssh:// url to https', () => {
    expect(toHttpsUrl('ssh://git@github.com/owner/repo.git')).toBe('https://github.com/owner/repo.git');
  });

  it('leaves an already-https url unchanged', () => {
    expect(toHttpsUrl('https://github.com/owner/repo.git')).toBe('https://github.com/owner/repo.git');
  });
});

describe('getRemoteUrl', () => {
  it('returns the origin remote url', () => {
    expect(getRemoteUrl(repoDir)).toBe(path.join(tmpDir, 'origin.git'));
  });

  it('throws when no origin remote is configured', () => {
    const noRemoteDir = path.join(tmpDir, 'no-remote-repo');
    mkdirSync(noRemoteDir, { recursive: true });
    execSync('git init', { cwd: noRemoteDir, stdio: 'pipe' });
    expect(() => getRemoteUrl(noRemoteDir)).toThrow();
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
