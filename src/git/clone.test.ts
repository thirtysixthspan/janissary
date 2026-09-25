import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import type * as ChildProcess from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

// The spawn is observed rather than replaced: every clone below really runs, and the one that names
// github.com is pointed at the local bare repository instead, so nothing here reaches GitHub.
const spawnSpy = vi.hoisted(() => ({ calls: [] as { args: string[]; env?: NodeJS.ProcessEnv }[], redirect: new Map<string, string>() }));
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof ChildProcess>();
  return {
    ...actual,
    spawn: (command: string, args: string[], options: ChildProcess.SpawnOptions) => {
      spawnSpy.calls.push({ args, env: options.env });
      return actual.spawn(command, args.map((arg) => spawnSpy.redirect.get(arg) ?? arg), options);
    },
  };
});

const { startGitClone } = await import('./clone.js');

let tmpDir: string;
let bareDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'git-clone-test-'));
  bareDir = path.join(tmpDir, 'origin.git');
  mkdirSync(bareDir);
  execSync('git init --bare', { cwd: bareDir, stdio: 'pipe' });
  const seed = path.join(tmpDir, 'seed');
  mkdirSync(seed);
  execSync('git init', { cwd: seed, stdio: 'pipe' });
  execSync('git config user.email test@test.com && git config user.name test', { cwd: seed, stdio: 'pipe' });
  writeFileSync(path.join(seed, 'README.md'), '# Seed');
  execSync('git add . && git commit -m init', { cwd: seed, stdio: 'pipe' });
  execSync(`git remote add origin "${bareDir}" && git push origin HEAD`, { cwd: seed, stdio: 'pipe' });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('startGitClone', () => {
  it('clones a local bare repository', async () => {
    const target = path.join(tmpDir, 'plain-clone');
    await startGitClone(bareDir, target).ready;
    expect(existsSync(path.join(target, 'README.md'))).toBe(true);
  });

  it('rejects with git\'s first stderr line when stderr is kept', async () => {
    const missing = path.join(tmpDir, 'missing.git');
    const clone = startGitClone(missing, path.join(tmpDir, 'kept-clone'), { keepStderr: true });
    await expect(clone.ready).rejects.toThrow(/^fatal: /);
  });

  it('rejects with the exit code when stderr is ignored', async () => {
    const missing = path.join(tmpDir, 'missing.git');
    const clone = startGitClone(missing, path.join(tmpDir, 'ignored-clone'));
    await expect(clone.ready).rejects.toThrow(/^git clone exited with code \d+$/);
  });

  it('kills the clone on cancel and rejects', async () => {
    const clone = startGitClone(bareDir, path.join(tmpDir, 'cancelled-clone'));
    clone.cancel();
    await expect(clone.ready).rejects.toThrow('git clone cancelled.');
  });

  it('hands a GitHub token to git through the environment only', async () => {
    const url = 'https://github.com/owner/private-repo.git';
    spawnSpy.redirect.set(url, bareDir);
    const target = path.join(tmpDir, 'token-clone');
    await startGitClone('git@github.com:owner/private-repo.git', target, { githubToken: 'ghp_secret_token' }).ready;
    const call = spawnSpy.calls.at(-1)!;
    expect(call.args).toContain(url);
    expect(call.args.join(' ')).not.toContain('ghp_secret_token');
    expect(call.args.slice(0, 2)).toEqual(['-c', 'credential.helper=']);
    expect(call.env?.JANUS_CLONE_GITHUB_TOKEN).toBe('ghp_secret_token');
    expect(call.env?.GIT_TERMINAL_PROMPT).toBe('0');
    const config = readFileSync(path.join(target, '.git', 'config'), 'utf8');
    expect(config).not.toContain('ghp_secret_token');
    expect(config).not.toContain('credential');
  });

  it('never sends a GitHub token to another host', async () => {
    const clone = startGitClone(bareDir, path.join(tmpDir, 'no-token-clone'), { githubToken: 'ghp_secret_token' });
    await clone.ready;
    const call = spawnSpy.calls.at(-1)!;
    expect(call.args).toEqual(['clone', bareDir, path.join(tmpDir, 'no-token-clone')]);
    expect(call.env?.JANUS_CLONE_GITHUB_TOKEN).toBeUndefined();
  });
});
