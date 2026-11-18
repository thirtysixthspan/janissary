import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initWorkspaceDir, workspacePath, workspaceTempPath } from '../workspace/index.js';
import type { WorkspaceManager, ProvisioningWorkspace } from '../workspace/manager.js';
import type { ProjectTokens } from '../project/tokens.js';
import { AGENT_CLONE_DEPTH } from '../workspace/clone-depth.js';
import { RemoteRunClones } from './serve-run-clones.js';

// Scratch workspace paths and a scratch Claude config, the same fixture `serve-provision.test.ts`
// uses. The manager below is a stub of the documented `create`/`tracks`/`cancel`/`remove` contract:
// it tracks a directory from `create` until `remove`, and `remove` is a no-op on an untracked one.
let root: string;

type Handle = {
  dir: string;
  ready: Promise<void>;
  settle: PromiseWithResolvers<void>;
  cancel: ReturnType<typeof vi.fn>;
};

function fixture(mainLabel = 'main', tokens?: ProjectTokens) {
  const merged = tokens ?? { github: 'forwarded' };
  const tracked = new Set<string>();
  const removed: string[] = [];
  const managerCancelled: string[] = [];
  const createCalls: { label: string; github: string | undefined; options: unknown }[] = [];
  const handles: Handle[] = [];

  function defaultCreate(label: string): Handle {
    const dir = workspacePath(label);
    const settle = Promise.withResolvers<void>();
    tracked.add(dir);
    const handle: Handle = { dir, ready: settle.promise, settle, cancel: vi.fn() };
    handles.push(handle);
    return handle;
  }

  let createImpl: (label: string) => ProvisioningWorkspace | { error: string } = defaultCreate;
  const workspaces = {
    create: vi.fn((label: string, github?: string, options?: unknown) => {
      createCalls.push({ label, github, options });
      return createImpl(label);
    }),
    tracks: vi.fn((dir: string) => tracked.has(dir)),
    remove: vi.fn((dir: string) => { if (tracked.delete(dir)) removed.push(dir); }),
    cancel: vi.fn((label: string) => { managerCancelled.push(label); }),
  } as unknown as WorkspaceManager;

  const service = new RemoteRunClones(workspaces, merged, mainLabel);
  return {
    service, workspaces, tracked, removed, managerCancelled, createCalls, handles,
    defaultCreate, setCreate: (fn: typeof createImpl) => { createImpl = fn; },
  };
}

type Fixture = ReturnType<typeof fixture>;

async function pending(f: Fixture): Promise<Handle> {
  await vi.waitFor(() => expect(f.handles.length).toBeGreaterThan(0));
  return f.handles.at(-1)!;
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'serve-run-clones-')));
  initWorkspaceDir(root, path.join(root, '.claude.json'));
});

afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('RemoteRunClones — create and lookup', () => {
  it('reports a clone as pending before its readiness settles', async () => {
    const f = fixture();
    const result = f.service.create('alpha');
    const handle = await pending(f);
    expect(handle.dir).toBe(workspacePath('alpha'));
    expect(f.service.lookup('alpha')).toBeUndefined();
    handle.settle.resolve();
    await result;
  });

  it('creates one shallow all-branch clone with the merged GitHub credential', async () => {
    const f = fixture('main', { github: 'merged', claude: 'ignored' });
    const result = f.service.create('alpha');
    await pending(f);
    expect(f.createCalls).toEqual([{ label: 'alpha', github: 'merged', options: { depth: AGENT_CLONE_DEPTH, allBranches: true } }]);
    expect(f.workspaces.create).toHaveBeenCalledOnce();
    f.handles[0].settle.resolve();
    await result;
  });

  it('publishes lookup only after full readiness, not on clone start', async () => {
    const f = fixture();
    const result = f.service.create('alpha');
    const handle = await pending(f);
    expect(f.service.lookup('alpha')).toBeUndefined();
    handle.settle.resolve();
    expect(await result).toEqual({ dir: workspacePath('alpha') });
    expect(f.service.lookup('alpha')).toBe(workspacePath('alpha'));
  });

  it('keeps two independent labels separate', async () => {
    const f = fixture();
    const a = f.service.create('alpha');
    const b = f.service.create('beta');
    await vi.waitFor(() => expect(f.handles).toHaveLength(2));
    f.handles[0].settle.resolve();
    f.handles[1].settle.resolve();
    const aResult = await a;
    const bResult = await b;
    expect(aResult.dir).toBe(workspacePath('alpha'));
    expect(bResult.dir).toBe(workspacePath('beta'));
    expect(f.service.lookup('alpha')).toBe(workspacePath('alpha'));
    expect(f.service.lookup('beta')).toBe(workspacePath('beta'));
  });

  it('refuses invalid labels before deriving a path or touching the manager', async () => {
    const f = fixture();
    for (const label of ['', '.', '..', 'a/b', String.raw`a\b`, 'a\0b']) {
      const created = await f.service.create(label);
      expect(created.error).toMatch(/^Cannot launch /);
      expect(f.service.lookup(label)).toBeUndefined();
      const released = await f.service.release(label);
      expect(released.error).toMatch(/^Cannot launch /);
    }
    expect(f.workspaces.create).not.toHaveBeenCalled();
  });

  it('refuses the main label and any case variant of a reserved or occupied label', async () => {
    const f = fixture('Main');
    const lower = await f.service.create('main');
    expect(lower).toEqual({ error: 'Remote run clone "main" already exists.' });
    const upper = await f.service.create('MAIN');
    expect(upper).toEqual({ error: 'Remote run clone "MAIN" already exists.' });
    expect(f.workspaces.create).not.toHaveBeenCalled();
  });

  it('refuses a label whose directory the manager already tracks', async () => {
    const f = fixture();
    f.tracked.add(workspacePath('tracked'));
    expect(await f.service.create('tracked')).toEqual({ error: 'Remote run clone "tracked" already exists.' });
    expect(f.workspaces.create).not.toHaveBeenCalled();
    expect(f.tracked.has(workspacePath('tracked'))).toBe(true);
  });

  it('refuses an existing directory and an existing scratch sibling without touching them', async () => {
    const f = fixture();
    const occupied = workspacePath('occupied');
    mkdirSync(occupied, { recursive: true });
    writeFileSync(path.join(occupied, 'keep.txt'), 'keep');
    mkdirSync(workspaceTempPath('scratch'), { recursive: true });
    expect(await f.service.create('occupied')).toEqual({ error: 'Remote run clone "occupied" already exists.' });
    expect(await f.service.create('scratch')).toEqual({ error: 'Remote run clone "scratch" already exists.' });
    expect(f.workspaces.create).not.toHaveBeenCalled();
    expect(f.workspaces.remove).not.toHaveBeenCalled();
    expect(f.service.lookup('occupied')).toBeUndefined();
    expect(f.service.lookup('scratch')).toBeUndefined();
  });

  it('rechecks occupancy after reservation, when a path appears before the queued start', async () => {
    const f = fixture();
    const result = f.service.create('race');
    mkdirSync(workspacePath('race'), { recursive: true });
    expect(await result).toEqual({ error: 'Remote run clone "race" already exists.' });
    expect(f.workspaces.create).not.toHaveBeenCalled();
    expect(f.workspaces.remove).not.toHaveBeenCalled();
    expect(f.service.lookup('race')).toBeUndefined();
  });

  it('refuses duplicate pending, ready and releasing entries', async () => {
    const f = fixture();
    const pendingResult = f.service.create('alpha');
    await pending(f);
    expect(await f.service.create('ALPHA')).toEqual({ error: 'Remote run clone "ALPHA" already exists.' });
    f.handles[0].settle.resolve();
    await pendingResult;
    expect(await f.service.create('alpha')).toEqual({ error: 'Remote run clone "alpha" already exists.' });
    const releasing = f.service.release('alpha');
    expect(await f.service.create('alpha')).toEqual({ error: 'Remote run clone "alpha" already exists.' });
    await releasing;
  });

  it('answers an unknown or invalid release with empty success and unknown lookup with undefined', async () => {
    const f = fixture();
    expect(await f.service.release('never-made')).toEqual({});
    expect(f.service.lookup('never-made')).toBeUndefined();
    expect(await f.service.release('bad/name')).toEqual({ error: expect.stringMatching(/^Cannot launch /) });
  });

  it('turns a synchronous error-object refusal into an error result without removal, and allows retry', async () => {
    const f = fixture();
    f.setCreate(() => ({ error: 'no origin' }));
    expect(await f.service.create('x')).toEqual({ error: 'no origin' });
    expect(f.removed).toEqual([]);
    expect(await f.service.create('x')).toEqual({ error: 'no origin' });
    expect(f.createCalls).toHaveLength(2);
  });

  it('turns a thrown create error into an error result without removal', async () => {
    const f = fixture();
    f.setCreate(() => { throw new Error('git refused'); });
    expect(await f.service.create('x')).toEqual({ error: 'git refused' });
    expect(f.removed).toEqual([]);
  });

  it('removes a failed clone after readiness settles and clears its reservation', async () => {
    const f = fixture();
    const result = f.service.create('x');
    const handle = await pending(f);
    handle.settle.reject(new Error('clone failed'));
    expect(await result).toEqual({ error: 'clone failed' });
    expect(f.removed).toEqual([workspacePath('x')]);
    expect(f.service.lookup('x')).toBeUndefined();
    const retry = f.service.create('x');
    await vi.waitFor(() => expect(f.handles).toHaveLength(2));
    f.handles[1].settle.resolve();
    expect(await retry).toEqual({ dir: workspacePath('x') });
  });
});

describe('RemoteRunClones — release and cancellation', () => {
  it('releases a ready clone exactly once and hides its lookup', async () => {
    const f = fixture();
    const dir = workspacePath('x');
    const result = f.service.create('x');
    const handle = await pending(f);
    handle.settle.resolve();
    await result;
    expect(await f.service.release('x')).toEqual({});
    expect(f.service.lookup('x')).toBeUndefined();
    expect(f.removed).toEqual([dir]);
  });

  it('cancels a queued start before any clone is created', async () => {
    const f = fixture();
    const result = f.service.create('x');
    const released = f.service.release('x');
    expect(await released).toEqual({});
    expect(await result).toEqual({ error: 'git clone cancelled.' });
    expect(f.workspaces.create).not.toHaveBeenCalled();
    expect(f.handles).toHaveLength(0);
    expect(f.removed).toEqual([]);
  });

  it('cancels a pending create, waits for readiness, then removes', async () => {
    const f = fixture();
    const result = f.service.create('x');
    const handle = await pending(f);
    const released = f.service.release('x');
    expect(handle.cancel).toHaveBeenCalledOnce();
    expect(f.service.lookup('x')).toBeUndefined();
    handle.settle.reject(new Error('late failure'));
    expect(await released).toEqual({});
    expect(await result).toEqual({ error: 'git clone cancelled.' });
    expect(f.removed).toEqual([workspacePath('x')]);
  });

  it('applies a reentrant cancellation to a handle installed afterwards', async () => {
    const f = fixture();
    const service = f.service;
    f.setCreate((label) => {
      void service.release(label);
      return f.defaultCreate(label);
    });
    const result = service.create('x');
    const handle = await pending(f);
    expect(handle.cancel).toHaveBeenCalledOnce();
    handle.settle.resolve();
    expect(await result).toEqual({ error: 'git clone cancelled.' });
  });

  it('never publishes or reports success when readiness resolves after cancellation', async () => {
    const f = fixture();
    const result = f.service.create('x');
    const handle = await pending(f);
    const released = f.service.release('x');
    handle.settle.resolve();
    await released;
    expect(await result).toEqual({ error: 'git clone cancelled.' });
    expect(f.service.lookup('x')).toBeUndefined();
    expect(f.removed).toEqual([workspacePath('x')]);
  });

  it('falls back to the manager when a handle has no cancel function', async () => {
    const f = fixture();
    f.setCreate((label) => {
      const dir = workspacePath(label);
      const settle = Promise.withResolvers<void>();
      f.tracked.add(dir);
      const handle = { dir, ready: settle.promise, settle, cancel: undefined } as unknown as ProvisioningWorkspace;
      f.handles.push(handle as Handle);
      return handle;
    });
    const result = f.service.create('x');
    const handle = await pending(f);
    const released = f.service.release('x');
    expect(f.managerCancelled).toEqual(['x']);
    handle.settle.resolve();
    expect(await released).toEqual({});
    expect(await result).toEqual({ error: 'git clone cancelled.' });
  });

  it('still waits and removes when cancellation throws, reporting it on release only', async () => {
    const f = fixture();
    f.setCreate((label) => {
      const handle = f.defaultCreate(label);
      handle.cancel.mockImplementation(() => { throw new Error('cancel broke'); });
      return handle;
    });
    const result = f.service.create('x');
    const handle = await pending(f);
    const released = f.service.release('x');
    handle.settle.resolve();
    expect(await released).toEqual({ error: 'cancel broke' });
    expect(await result).toEqual({ error: 'git clone cancelled.' });
    expect(f.removed).toEqual([workspacePath('x')]);
  });

  it('shares cleanup across concurrent and case-variant releases without removing twice', async () => {
    const f = fixture();
    const result = f.service.create('x');
    const handle = await pending(f);
    handle.settle.resolve();
    await result;
    await Promise.all([f.service.release('x'), f.service.release('x'), f.service.release('X')]);
    expect(f.removed).toEqual([workspacePath('x')]);
    expect(f.workspaces.remove).toHaveBeenCalledOnce();
  });

  it('holds the reservation until cleanup settles and keeps a retry independent of stale completion', async () => {
    const f = fixture();
    const dir = workspacePath('x');
    const first = f.service.create('x');
    const handle = await pending(f);
    handle.settle.reject(new Error('old failed'));
    expect(await f.service.create('x')).toEqual({ error: 'Remote run clone "x" already exists.' });
    expect(await first).toEqual({ error: 'old failed' });
    expect(f.removed).toEqual([dir]);

    const retry = f.service.create('x');
    const fresh = await pending(f);
    handle.settle.resolve();
    expect(f.service.lookup('x')).toBeUndefined();
    fresh.settle.resolve();
    expect(await retry).toEqual({ dir });
    expect(f.service.lookup('x')).toBe(dir);
  });
});

describe('RemoteRunClones — stop', () => {
  it('returns synchronously with nothing pending and is idempotent', () => {
    const f = fixture();
    expect(f.service.stop()).toBeUndefined();
    expect(f.service.stop()).toBeUndefined();
  });

  it('drains pending work before returning', async () => {
    const f = fixture();
    const result = f.service.create('x');
    const handle = await pending(f);
    const draining = f.service.stop();
    expect(draining).toBeDefined();
    handle.settle.resolve();
    await draining;
    expect(await result).toEqual({ error: 'git clone cancelled.' });
    expect(f.removed).toEqual([workspacePath('x')]);
  });

  it('refuses new creates and hides lookup after stopping', async () => {
    const f = fixture();
    const result = f.service.create('x');
    const handle = await pending(f);
    handle.settle.resolve();
    await result;
    expect(f.service.lookup('x')).toBe(workspacePath('x'));
    f.service.stop();
    expect(f.service.lookup('x')).toBeUndefined();
    expect(await f.service.create('y')).toEqual({ error: 'Remote run clone service is stopping.' });
    expect(f.workspaces.create).toHaveBeenCalledOnce();
    expect(f.service.stop()).toBeUndefined();
  });

  it('preserves ready manager references for the server guarded removeAll', async () => {
    const f = fixture();
    const dir = workspacePath('x');
    const result = f.service.create('x');
    const handle = await pending(f);
    handle.settle.resolve();
    await result;
    f.service.stop();
    expect(f.tracked.has(dir)).toBe(true);
    expect(f.removed).toEqual([]);
  });
});
