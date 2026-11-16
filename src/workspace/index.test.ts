import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { findRepoRoot, initWorkspaceDir, provisionWorkspace, removeWorkspace, clearWorkspaceDir, workspacePath, workspaceTempPath, getRemoteUrl, trustWorkspace, untrustWorkspace } from './index.js';
import { toHttpsUrl } from '../git/repository-url.js';
import { loadOpencodeOauth } from '../project/opencode-oauth.js';
import * as scratch from './scratch.js';
import { OPENCODE_OAUTH_FAILURE_NOTICE } from '../sandbox/opencode-data.js';

let tmpDir: string;
let repoDir: string;

// Test-only helper mirroring the old synchronous `createWorkspace(name, repoPath)`: resolves the
// remote synchronously (as `WorkspaceManager.create` does) then awaits the async clone.
async function createWorkspace(name: string, repoPath: string): Promise<string> {
  const handle = provisionWorkspace(name, getRemoteUrl(repoPath));
  await handle.ready;
  return handle.dir;
}

// An in-flight attempt clones into a unique sibling beside the final directory — `<name>.clone-`
// followed by a UUID — and moves it into place only once it finishes. The final directory stays
// absent while the clone runs, so tests watch these siblings to see its progress.
function stagingSiblings(name: string): string[] {
  const base = path.dirname(workspacePath(name));
  return readdirSync(base)
    .filter((entry) => entry.startsWith(`${name}.clone-`))
    .map((entry) => path.join(base, entry));
}

// Put a stand-in `git` first on PATH for one test. The workspace base is per-test, so nothing else
// in the suite runs the stand-in.
function installStandInGit(folder: string, script: string): string {
  const bin = path.join(tmpDir, folder);
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, 'git'), script);
  chmodSync(path.join(bin, 'git'), 0o755);
  return bin;
}

// Wait until the attempt's staging clone holds `marker`, then return that staging directory.
async function waitForStaging(name: string, marker: string): Promise<string> {
  return vi.waitFor(() => {
    const found = stagingSiblings(name).find((dir) => existsSync(path.join(dir, marker)));
    if (found === undefined) throw new Error(`staging clone for ${name} has no ${marker} yet`);
    return found;
  });
}

beforeAll(() => {
  mkdirSync('temp', { recursive: true });
  tmpDir = mkdtempSync(path.join(process.cwd(), 'temp', 'workspace-test-'));
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
  initWorkspaceDir(tmpDir, path.join(tmpDir, '.claude.json'));
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

  // 'returns undefined when no .git is found' lives in repo-root.unsandboxed.test.ts —
  // it assumes os.tmpdir() has no .git ancestor, which is false whenever the test runner itself
  // is executing inside a sandboxed workspace (TMPDIR is overridden to a path nested inside the
  // parent repo's own git tree).
});

describe('trustWorkspace', () => {
  it('creates a missing configuration with the workspace trusted', () => {
    const config = path.join(tmpDir, 'missing-claude.json');
    trustWorkspace('/workspace/new', config);
    expect(JSON.parse(readFileSync(config, 'utf8'))).toEqual({
      projects: { '/workspace/new': { hasTrustDialogAccepted: true } },
    });
  });

  it('preserves unrelated fields and existing workspace settings', () => {
    const config = path.join(tmpDir, 'valid-claude.json');
    writeFileSync(config, JSON.stringify({ theme: 'dark', projects: { '/workspace/new': { model: 'opus' } } }));
    trustWorkspace('/workspace/new', config);
    expect(JSON.parse(readFileSync(config, 'utf8'))).toEqual({
      theme: 'dark',
      projects: { '/workspace/new': { model: 'opus', hasTrustDialogAccepted: true } },
    });
  });

  it('leaves malformed JSON byte-for-byte unchanged', () => {
    const config = path.join(tmpDir, 'malformed-claude.json');
    const original = '{broken';
    writeFileSync(config, original);
    expect(() => trustWorkspace('/workspace/new', config)).toThrow('Failed to parse Claude configuration');
    expect(readFileSync(config, 'utf8')).toBe(original);
  });

  it.each([
    ['root', '[]'],
    ['projects', JSON.stringify({ projects: [] })],
  ])('leaves an invalid %s shape unchanged', (_case, original) => {
    const config = path.join(tmpDir, `invalid-${_case}-claude.json`);
    writeFileSync(config, original);
    expect(() => trustWorkspace('/workspace/new', config)).toThrow('not an object');
    expect(readFileSync(config, 'utf8')).toBe(original);
  });
});

describe('untrustWorkspace', () => {
  it('removes only the injected workspace trust entry', () => {
    const config = path.join(tmpDir, 'untrust-claude.json');
    writeFileSync(config, JSON.stringify({
      projects: {
        '/workspace/remove': { hasTrustDialogAccepted: true },
        '/workspace/keep': { hasTrustDialogAccepted: true },
      },
    }));

    untrustWorkspace('/workspace/remove', config);

    expect(JSON.parse(readFileSync(config, 'utf8'))).toEqual({
      projects: { '/workspace/keep': { hasTrustDialogAccepted: true } },
    });
  });

  it.each([
    ['a null root', 'null'],
    ['an array projects', JSON.stringify({ projects: ['/workspace/remove'] })],
    ['a string projects', JSON.stringify({ projects: '/workspace/remove' })],
    ['malformed JSON', '{ "projects": '],
  ])('leaves a configuration with %s untouched without throwing', (_shape, contents) => {
    const config = path.join(tmpDir, 'untrust-invalid-claude.json');
    writeFileSync(config, contents);

    expect(() => untrustWorkspace('/workspace/remove', config)).not.toThrow();
    expect(readFileSync(config, 'utf8')).toBe(contents);
  });
});

describe('createWorkspace', () => {
  it('completes readiness with a bounded optional credential notice', async () => {
    const prepare = vi.spyOn(scratch, 'createWorkspaceScratch').mockImplementationOnce((directory) => {
      mkdirSync(`${directory}.tmp`);
      return OPENCODE_OAUTH_FAILURE_NOTICE;
    });
    try {
      const handle = provisionWorkspace('oauth-failed-agent', getRemoteUrl(repoDir));
      expect(handle.oauthNotice).toBeUndefined();
      await expect(handle.ready).resolves.toBeUndefined();
      expect(handle.oauthNotice).toBe(OPENCODE_OAUTH_FAILURE_NOTICE);
      removeWorkspace(handle.dir);
    } finally {
      prepare.mockRestore();
    }
  });

  it('creates an independent clone of the repo\'s origin remote', async () => {
    const ws = await createWorkspace('test-agent', repoDir);
    expect(existsSync(ws)).toBe(true);
    expect(existsSync(path.join(ws, '.git'))).toBe(true);
    expect(existsSync(path.join(ws, 'README.md'))).toBe(true);
    removeWorkspace(ws);
  });

  it('also creates a sibling .tmp scratch dir', async () => {
    const ws = await createWorkspace('test-agent-tmp', repoDir);
    expect(existsSync(workspaceTempPath('test-agent-tmp'))).toBe(true);
    removeWorkspace(ws);
  });

  it('seeds OAuth before the workspace becomes ready', async () => {
    const home = path.join(tmpDir, 'oauth-home');
    mkdirSync(path.join(home, '.codex'), { recursive: true });
    writeFileSync(path.join(home, '.codex', 'auth.json'), JSON.stringify({ tokens: {
      access_token: `header.${Buffer.from('{"exp":1800000000}').toString('base64url')}.signature`,
      refresh_token: 'test-refresh', account_id: 'test-account',
    } }));
    loadOpencodeOauth(home);
    try {
      const ws = await createWorkspace('oauth-agent', repoDir);
      const auth = JSON.parse(readFileSync(path.join(`${ws}.tmp`, 'opencode-data', 'opencode', 'auth.json'), 'utf8'));
      expect(auth.openai.accountId).toBe('test-account');
      removeWorkspace(ws);
    } finally {
      loadOpencodeOauth(path.join(home, 'absent'));
    }
  });

  it('makes gh the only credential helper git will actually consult', async () => {
    // Asserting on `git config --local credential.helper` alone would pass even when the helper is
    // shadowed: git accumulates the key across the system, global, and local scopes and the first
    // helper to answer wins, so an ambient `osxkeychain` entry (the macOS default) would be queried
    // first and `gh` — and therefore the injected `GH_TOKEN` — never consulted. Stand up throwaway
    // system and global configs holding exactly that ambient entry, and assert on the *effective*
    // list git resolves in the workspace.
    const ws = await createWorkspace('test-agent-credhelper', repoDir);
    const ambientConfig = path.join(tmpDir, 'ambient.gitconfig');
    writeFileSync(ambientConfig, '[credential]\n\thelper = osxkeychain\n');
    const raw = execSync('git config --get-all credential.helper', {
      cwd: ws,
      stdio: 'pipe',
      env: { ...process.env, GIT_CONFIG_SYSTEM: ambientConfig, GIT_CONFIG_GLOBAL: ambientConfig },
    }).toString().split('\n').slice(0, -1);

    // git's own reset rule: an empty value discards every helper accumulated so far, so only the
    // entries after the last empty one are ever queried.
    const lastReset = raw.lastIndexOf('');
    expect(raw.slice(lastReset + 1)).toEqual(['!gh auth git-credential']);
    removeWorkspace(ws);
  });

  it('clones from the origin\'s original url, then rewrites the workspace\'s own origin to https', async () => {
    // The clone itself must use whatever transport already works on the host (unsandboxed) — only
    // the resulting workspace's origin is switched to https, for later in-sandbox git operations.
    const ws = await createWorkspace('test-agent-origin-rewrite', repoDir);
    const wsOrigin = execSync('git remote get-url origin', { cwd: ws, stdio: 'pipe' }).toString().trim();
    expect(wsOrigin).toBe(toHttpsUrl(getRemoteUrl(repoDir)));
    removeWorkspace(ws);
  });

  it('can be cancelled mid-clone, leaving no partial target directory', async () => {
    // A real local clone can finish, or be killed before git creates its target, so drive the
    // cancellation through a git that is guaranteed to have created a partial directory first.
    // That is the state a loaded CI runner reaches: the kill lands after git has made the folder.
    const bin = installStandInGit('slow-git', '#!/bin/sh\nfor last; do :; done\nmkdir -p "$last"\nprintf partial > "$last/partial"\nexec sleep 30\n');
    const remoteUrl = getRemoteUrl(repoDir);
    const originalPath = process.env['PATH'] ?? '';
    process.env['PATH'] = `${bin}:${originalPath}`;
    try {
      const handle = provisionWorkspace('test-agent-cancel', remoteUrl);
      await waitForStaging('test-agent-cancel', 'partial');
      handle.cancel();
      await expect(handle.ready).rejects.toThrow();
      expect(existsSync(handle.dir)).toBe(false);
      expect(stagingSiblings('test-agent-cancel')).toEqual([]);
    } finally {
      process.env['PATH'] = originalPath;
    }
  });

  it('does not let a cancelled attempt remove a newer clone under the same name', async () => {
    // Hold the first attempt's rejection open so the second attempt can land its clone first: the
    // exact ordering that let the old cleanup delete a newer launch's directory.
    const release = path.join(tmpDir, 'release-cancelled-attempt');
    const bin = installStandInGit('race-git', [
      '#!/bin/sh',
      "trap '' TERM",
      'for last; do :; done',
      'mkdir -p "$last"',
      'printf partial > "$last/partial"',
      `while [ ! -e "${release}" ]; do sleep 0.05; done`,
      'exit 1',
    ].join('\n'));
    const name = 'test-agent-cancel-race';
    const remoteUrl = getRemoteUrl(repoDir);
    const originalPath = process.env['PATH'] ?? '';
    process.env['PATH'] = `${bin}:${originalPath}`;
    try {
      const first = provisionWorkspace(name, remoteUrl);
      await waitForStaging(name, 'partial');
      first.cancel();
      process.env['PATH'] = originalPath;

      const second = provisionWorkspace(name, remoteUrl);
      await expect(second.ready).resolves.toBeUndefined();
      expect(existsSync(path.join(second.dir, 'README.md'))).toBe(true);

      writeFileSync(release, 'release');
      await expect(first.ready).rejects.toThrow();
      expect(existsSync(path.join(second.dir, 'README.md'))).toBe(true);
      expect(stagingSiblings(name)).toEqual([]);
      removeWorkspace(second.dir);
    } finally {
      process.env['PATH'] = originalPath;
      writeFileSync(release, 'release');
    }
  });

  it('leaves a folder already at the target untouched when an attempt is cancelled', async () => {
    const name = 'test-agent-preexisting-target';
    const target = workspacePath(name);
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, 'keep.txt'), 'keep');
    const bin = installStandInGit('preexisting-git', '#!/bin/sh\nfor last; do :; done\nmkdir -p "$last"\nprintf partial > "$last/partial"\nexec sleep 30\n');
    const remoteUrl = getRemoteUrl(repoDir);
    const originalPath = process.env['PATH'] ?? '';
    process.env['PATH'] = `${bin}:${originalPath}`;
    try {
      const handle = provisionWorkspace(name, remoteUrl);
      expect(handle.dir).toBe(target);
      await waitForStaging(name, 'partial');
      handle.cancel();
      await expect(handle.ready).rejects.toThrow();
      expect(readFileSync(path.join(target, 'keep.txt'), 'utf8')).toBe('keep');
      expect(stagingSiblings(name)).toEqual([]);
    } finally {
      process.env['PATH'] = originalPath;
      rmSync(target, { recursive: true, force: true });
    }
  });

  it('refuses a folder that appeared at the target while the clone finished', async () => {
    const release = path.join(tmpDir, 'release-completed-attempt');
    const name = 'test-agent-target-appeared';
    const bin = installStandInGit('appeared-git', [
      '#!/bin/sh',
      'for last; do :; done',
      'mkdir -p "$last"',
      'printf clone > "$last/clone"',
      `while [ ! -e "${release}" ]; do sleep 0.05; done`,
      'exit 0',
    ].join('\n'));
    const target = workspacePath(name);
    const remoteUrl = getRemoteUrl(repoDir);
    const originalPath = process.env['PATH'] ?? '';
    process.env['PATH'] = `${bin}:${originalPath}`;
    try {
      const handle = provisionWorkspace(name, remoteUrl);
      await waitForStaging(name, 'clone');
      mkdirSync(target, { recursive: true });
      writeFileSync(path.join(target, 'keep.txt'), 'keep');
      writeFileSync(release, 'release');
      await expect(handle.ready).rejects.toThrow(`A workspace folder already exists at ${target}.`);
      expect(readFileSync(path.join(target, 'keep.txt'), 'utf8')).toBe('keep');
      expect(stagingSiblings(name)).toEqual([]);
    } finally {
      process.env['PATH'] = originalPath;
      writeFileSync(release, 'release');
      rmSync(target, { recursive: true, force: true });
    }
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
  it('removes the sibling .tmp scratch dir along with the clone', async () => {
    const ws = await createWorkspace('test-agent-cleanup', repoDir);
    const tmp = workspaceTempPath('test-agent-cleanup');
    expect(existsSync(tmp)).toBe(true);
    removeWorkspace(ws);
    expect(existsSync(ws)).toBe(false);
    expect(existsSync(tmp)).toBe(false);
  });

  it('untrusts the clone in the configuration given to initWorkspaceDir', async () => {
    const ws = await createWorkspace('test-agent-untrust', repoDir);
    const config = path.join(tmpDir, '.claude.json');
    const before = JSON.parse(readFileSync(config, 'utf8')) as { projects: Record<string, unknown> };
    expect(before.projects[ws]).toEqual({ hasTrustDialogAccepted: true });

    removeWorkspace(ws);

    const after = JSON.parse(readFileSync(config, 'utf8')) as { projects: Record<string, unknown> };
    expect(Object.hasOwn(after.projects, ws)).toBe(false);
  });

  it('still removes the clone and its scratch dir when rewriting the configuration fails', async () => {
    const ws = await createWorkspace('test-agent-bad-config', repoDir);
    const tmp = workspaceTempPath('test-agent-bad-config');
    const config = path.join(tmpDir, '.claude.json');
    const original = readFileSync(config, 'utf8');
    try {
      chmodSync(tmpDir, 0o500);
      expect(() => removeWorkspace(ws)).not.toThrow();
    } finally {
      chmodSync(tmpDir, 0o755);
      writeFileSync(config, original);
    }
    expect(existsSync(ws)).toBe(false);
    expect(existsSync(tmp)).toBe(false);
  });
});

describe('clearWorkspaceDir', () => {
  it('removes all workspaces', async () => {
    await createWorkspace('agent-a', repoDir);
    await createWorkspace('agent-b', repoDir);
    clearWorkspaceDir();
    expect(existsSync(path.join(tmpDir, '.janissary', 'workspace', 'agent-a'))).toBe(false);
    expect(existsSync(path.join(tmpDir, '.janissary', 'workspace', 'agent-b'))).toBe(false);
  });
});
