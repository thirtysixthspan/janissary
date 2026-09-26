import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type * as Clone from '../git/clone.js';
import type { ServerFrame } from './protocol-frames.js';
import { resolveRemoteRoot, type RootOffer } from './serve-root.js';
import { acquireRootLock } from './serve-root-lock.js';

// Every clone really runs against a local bare repository, except in the one test that needs a clone
// still running when it is cancelled: that one swaps in a clone that writes a file and never ends.
const cloneMock = vi.hoisted(() => ({ hang: false, cancel: vi.fn(), failWith: undefined as string | undefined }));
vi.mock('../git/clone.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Clone>();
  return {
    ...actual,
    startGitClone: (url: string, target: string, options: Clone.GitCloneOptions) => {
      if (cloneMock.failWith !== undefined) return { ready: Promise.reject(new Error(cloneMock.failWith)), cancel: () => {} };
      if (!cloneMock.hang) return actual.startGitClone(url, target, options);
      mkdirSync(target, { recursive: true });
      writeFileSync(path.join(target, 'partial'), 'x');
      const killed = new AbortController();
      const ready = new Promise<void>((_resolve, reject) => {
        killed.signal.addEventListener('abort', () => reject(new Error('git clone cancelled.')));
      });
      return { ready, cancel: () => { cloneMock.cancel(); killed.abort(); } };
    },
  };
});

const { runRootOffer } = await import('./serve-root-offer.js');

let tmpDir: string;
let origin: string;
let home: string;

beforeAll(() => {
  tmpDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'root-offer-test-')));
  origin = path.join(tmpDir, 'origin.git');
  mkdirSync(origin);
  execSync('git init --bare', { cwd: origin, stdio: 'pipe' });
  const seed = path.join(tmpDir, 'seed');
  mkdirSync(seed);
  execSync('git init', { cwd: seed, stdio: 'pipe' });
  execSync('git config user.email test@test.com && git config user.name test', { cwd: seed, stdio: 'pipe' });
  writeFileSync(path.join(seed, 'README.md'), '# Seed');
  execSync('git add . && git commit -m init', { cwd: seed, stdio: 'pipe' });
  execSync(`git remote add origin "${origin}" && git push origin HEAD`, { cwd: seed, stdio: 'pipe' });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  cloneMock.hang = false;
  cloneMock.failWith = undefined;
  cloneMock.cancel.mockReset();
  home = mkdtempSync(path.join(tmpDir, 'home-'));
});

// `argument` is the address's path as the classifier sees it: the target itself by default, or `~`
// for a home-directory target.
function start(target: string, url = origin, argument = target) {
  const frames: ServerFrame[] = [];
  const offer: RootOffer = { target, url };
  const run = runRootOffer(offer, {
    emit: (frame) => { frames.push(frame); },
    classify: () => resolveRemoteRoot(argument, url, { home }),
    home,
  });
  const offered = () => vi.waitFor(() => expect(frames.some((frame) => frame.type === 'clone-offer')).toBe(true));
  return { run, frames, offered };
}

describe('runRootOffer', () => {
  it('asks, clones on a yes, and reports what it cloned', async () => {
    const target = path.join(tmpDir, 'accepted', 'proj');
    const { run, frames, offered } = start(target);
    await offered();
    expect(frames).toEqual([{ type: 'clone-offer', path: target, url: origin }]);
    expect(run.answer(true)).toBe(true);
    await expect(run.result).resolves.toEqual({ root: target, cloned: { url: origin, path: target } });
    expect(existsSync(path.join(target, 'README.md'))).toBe(true);
  });

  it('reports a decline and creates nothing', async () => {
    const target = path.join(tmpDir, 'declined');
    const { run, offered } = start(target);
    await offered();
    run.answer(false);
    await expect(run.result).resolves.toEqual({ refusal: { kind: 'declined', path: target, url: origin } });
    expect(existsSync(target)).toBe(false);
  });

  it('removes every folder a failed clone created and reports git\'s reason', async () => {
    const target = path.join(tmpDir, 'failed', 'deeper', 'proj');
    const missing = path.join(tmpDir, 'missing.git');
    const { run, offered } = start(target, missing);
    await offered();
    run.answer(true);
    const result = await run.result;
    expect(result).toEqual({
      refusal: { kind: 'clone-failed', path: target, url: missing, reason: expect.stringMatching(/^fatal: /) },
    });
    expect(existsSync(path.join(tmpDir, 'failed'))).toBe(false);
  });

  it('reports an origin that is a command transport as a failed clone, creating nothing', async () => {
    const target = path.join(tmpDir, 'injected', 'proj');
    const injected = 'ext::sh -c touch% /tmp/pwned';
    const { run, offered } = start(target, injected);
    await offered();
    run.answer(true);
    await expect(run.result).resolves.toEqual({
      refusal: {
        kind: 'clone-failed', path: target, url: injected,
        reason: `Refusing to clone ${injected}: the "ext::" transport runs a command rather than fetching a repository.`,
      },
    });
    expect(existsSync(path.join(tmpDir, 'injected'))).toBe(false);
  });

  it('reports a failed clone\'s reason without the credential its url carried', async () => {
    const target = path.join(tmpDir, 'credentialed', 'proj');
    cloneMock.failWith = "fatal: repository 'https://user:ghp_secret@github.com/owner/repo.git/' not found";
    const { run, offered } = start(target);
    await offered();
    run.answer(true);
    await expect(run.result).resolves.toEqual({
      refusal: {
        kind: 'clone-failed', path: target, url: origin,
        reason: "fatal: repository 'https://github.com/owner/repo.git/' not found",
      },
    });
  });

  it('keeps an existing empty folder, emptied, when its clone fails', async () => {
    const target = path.join(home, 'missing');
    mkdirSync(target);
    const missing = path.join(tmpDir, 'missing.git');
    const { run, offered } = start(target, missing, '~');
    await offered();
    run.answer(true);
    await expect(run.result).resolves.toMatchObject({ refusal: { kind: 'clone-failed' } });
    expect(readdirSync(target)).toEqual([]);
  });

  it('declines a prompt that is cancelled, and releases the lock', async () => {
    const target = path.join(tmpDir, 'cancelled-prompt');
    const { run, offered } = start(target);
    await offered();
    run.cancel();
    await expect(run.result).resolves.toEqual({ refusal: { kind: 'declined', path: target, url: origin } });
    const release = await acquireRootLock(target, { home, pollMs: 10 });
    release();
  });

  it('kills a clone cancelled mid-run and removes its partial folder', async () => {
    cloneMock.hang = true;
    const target = path.join(tmpDir, 'cancelled-clone', 'proj');
    const { run, offered } = start(target);
    await offered();
    run.answer(true);
    await vi.waitFor(() => expect(existsSync(path.join(target, 'partial'))).toBe(true));
    run.cancel();
    expect(cloneMock.cancel).toHaveBeenCalledOnce();
    expect(existsSync(path.join(tmpDir, 'cancelled-clone'))).toBe(false);
    await expect(run.result).resolves.toMatchObject({ refusal: { kind: 'clone-failed' } });
  });

  it('lets a waiter use the clone the lock holder made, without asking', async () => {
    const target = path.join(tmpDir, 'shared', 'proj');
    const first = start(target);
    await first.offered();
    const second = start(target);
    first.run.answer(true);
    await first.run.result;
    await expect(second.run.result).resolves.toEqual({ root: target });
    expect(second.frames).toEqual([]);
  });

  it('does not deliver an answer when no question is pending', async () => {
    const { run } = start(path.join(tmpDir, 'unasked'));
    expect(run.answer(true)).toBe(false);
    run.cancel();
    await expect(run.result).resolves.toMatchObject({ refusal: { kind: 'declined' } });
  });
});
