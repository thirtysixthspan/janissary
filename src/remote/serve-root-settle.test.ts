import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rootForRelay, startPeer, settleRoot } from './serve-root-settle.js';
import { getProjectTokens } from '../project/tokens.js';
import { getGitIdentity } from '../git/identity.js';
import { getConfig } from '../config.js';

const ORIGIN = 'git@github.com:owner/repo.git';

let tmpDir: string;
let home: string;

function repository(directory: string, origin: string): string {
  mkdirSync(directory, { recursive: true });
  execSync('git init', { cwd: directory, stdio: 'pipe' });
  execSync(`git remote add origin "${origin}"`, { cwd: directory, stdio: 'pipe' });
  return directory;
}

beforeEach(() => {
  tmpDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'serve-root-settle-test-')));
  home = path.join(tmpDir, 'home');
  mkdirSync(home);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('rootForRelay with the attaching project\'s origin', () => {
  it('finds the clone a home-directory launch made at <home>/<repo-name>', () => {
    const root = repository(path.join(home, 'repo'), 'https://github.com/owner/repo.git');
    expect(rootForRelay('~', ORIGIN, home)).toBe(root);
  });

  it('uses an explicit path holding a clone of this project', () => {
    const root = repository(path.join(tmpDir, 'proj'), ORIGIN);
    expect(rootForRelay(root, ORIGIN, home)).toBe(root);
  });

  it('finds no root where a launch would offer a clone, rather than offering one', () => {
    expect(rootForRelay('~', ORIGIN, home)).toBeUndefined();
    expect(rootForRelay(path.join(tmpDir, 'missing'), ORIGIN, home)).toBeUndefined();
  });

  it('finds no root at an explicit path whose repository has another origin', () => {
    const root = repository(path.join(tmpDir, 'proj'), 'git@github.com:owner/other.git');
    expect(rootForRelay(root, ORIGIN, home)).toBeUndefined();
  });
});

describe('rootForRelay without an origin', () => {
  it('keeps today\'s rules: the home directory is not a repository', () => {
    repository(path.join(home, 'repo'), ORIGIN);
    expect(rootForRelay('~', undefined, home)).toBeUndefined();
  });

  it('uses an explicit path whatever its origin', () => {
    const root = repository(path.join(tmpDir, 'proj'), 'git@github.com:owner/other.git');
    expect(rootForRelay(root, undefined, home)).toBe(root);
  });
});

// `settleRoot` takes no `home`, so the only way to keep the machine's real credentials out of these
// tests is the environment variable `os.homedir()` reads. Every block below restores it.
function withHome<T>(directory: string, run: () => T): T {
  const previous = process.env.HOME;
  process.env.HOME = directory;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.HOME;
    else process.env.HOME = previous;
  }
}

describe('settleRoot', () => {
  it('runs the startup setup against the root and hands back a manager bound to it', () => {
    const root = repository(path.join(tmpDir, 'settled'), ORIGIN);
    const manager = withHome(home, () => settleRoot(root));
    expect(manager.origin()).toBe(ORIGIN);
    const configPath = path.join(root, '.janissary', 'config.json');
    expect(existsSync(configPath)).toBe(true);
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual(getConfig());
  });

  it("takes a token from the root's own .janissary before the home's", () => {
    const root = path.join(tmpDir, 'token-root');
    mkdirSync(path.join(root, '.janissary'), { recursive: true });
    mkdirSync(path.join(home, '.janissary'), { recursive: true });
    writeFileSync(path.join(home, '.janissary', 'github-token'), 'from-home\n');
    writeFileSync(path.join(root, '.janissary', 'github-token'), 'from-root\n');
    withHome(home, () => settleRoot(root));
    expect(getProjectTokens().github).toBe('from-root');
  });

  it('falls back to the home token when the root holds none', () => {
    const root = path.join(tmpDir, 'bare-root');
    mkdirSync(path.join(root, '.janissary'), { recursive: true });
    mkdirSync(path.join(home, '.janissary'), { recursive: true });
    writeFileSync(path.join(home, '.janissary', 'github-token'), 'from-home\n');
    withHome(home, () => settleRoot(root));
    expect(getProjectTokens().github).toBe('from-home');
  });

  it('loads the identity git itself would resolve for the root', () => {
    const root = path.join(tmpDir, 'identified');
    repository(root, ORIGIN);
    execSync('git config user.name Settled', { cwd: root, stdio: 'pipe' });
    execSync('git config user.email settled@test.com', { cwd: root, stdio: 'pipe' });
    withHome(home, () => settleRoot(root));
    expect(getGitIdentity()).toEqual({ name: 'Settled', email: 'settled@test.com' });
  });

  it('leaves a corrupt config file untouched and answers the defaults a fresh root would', () => {
    const pristine = path.join(tmpDir, 'pristine');
    mkdirSync(pristine);
    withHome(home, () => settleRoot(pristine));
    const defaults = getConfig();

    const root = path.join(tmpDir, 'corrupt');
    mkdirSync(path.join(root, '.janissary'), { recursive: true });
    const configPath = path.join(root, '.janissary', 'config.json');
    writeFileSync(configPath, '{ not json');
    withHome(home, () => settleRoot(root));
    expect(getConfig()).toEqual(defaults);
    expect(readFileSync(configPath, 'utf8')).toBe('{ not json');
  });
});

describe('startPeer', () => {
  it('answers undefined rather than throwing when the peer socket cannot be opened', async () => {
    // A peer whose temp directory cannot be created fails before any socket is opened, which is the
    // `undefined` `serve.ts` turns into a clean shutdown.
    const root = path.join(tmpDir, 'peer-root');
    mkdirSync(root);
    const blocker = path.join(tmpDir, 'blocker');
    writeFileSync(blocker, 'a file where a directory belongs');
    const previous = process.env.TMPDIR;
    process.env.TMPDIR = path.join(blocker, 'unreachable');
    try {
      expect(await startPeer(root, 'session-1', () => {}, () => {})).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previous;
    }
    expect(existsSync(path.join(root, '.janissary', 'remote', 'session-1.json'))).toBe(false);
  });
});
