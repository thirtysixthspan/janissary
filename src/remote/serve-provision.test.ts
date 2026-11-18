import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { provisionRemoteWorkspace, type ProvisionContext, type ProvisionedWorkspace } from './serve-provision.js';
import { initWorkspaceDir, workspacePath } from '../workspace/index.js';
import type { WorkspaceManager } from '../workspace/manager.js';
import type { ServerFrame } from './protocol-frames.js';
import { OPENCODE_OAUTH_FAILURE_NOTICE } from '../sandbox/opencode-data.js';
import { loadProjectTokens, type ProjectTokens } from '../project/tokens.js';
import { AGENT_CLONE_DEPTH } from '../workspace/clone-depth.js';
import { webSearch } from '../web/search/search.js';

vi.mock('../web/search/search.js', () => ({ webSearch: vi.fn() }));

// The clone itself is `WorkspaceManager`'s and is exercised against a real repository in
// serve.test.ts. What is untested here is the sequence around it: the four points at which a
// provision stops before, or instead of, reaching the workspace — which is the whole reason this
// function is split out of `serve.ts`.

type Workspaces = {
  create: ReturnType<typeof vi.fn>;
  preflight: ReturnType<typeof vi.fn>;
  removeAll: ReturnType<typeof vi.fn>;
};

let root: string;

function cloned(dir: string, ready: Promise<unknown>): unknown {
  return { dir, ready, label: 'alpha' };
}

function requestWebSearch(workspace: ProvisionedWorkspace): void {
  workspace.files.open('files1');
  workspace.files.request({
    type: 'filesystem-request', session: 'files1', request: 'q1', operation: 'web-search',
    args: { query: 'vitest 2026', numResults: 5, maxChars: 2000, depth: 'advanced', provider: 'auto' },
  });
}

function harness(overrides: { workspaces?: Partial<Workspaces>; idle?: () => boolean; stopping?: () => boolean } = {}) {
  const workspaces = {
    create: vi.fn(() => cloned(path.join(root, 'alpha'), Promise.resolve())),
    preflight: vi.fn((): string | undefined => undefined),
    removeAll: vi.fn(),
    ...overrides.workspaces,
  } as Workspaces;
  const frames: ServerFrame[] = [];
  const provisioned = vi.fn<(workspace: ProvisionedWorkspace) => void>();
  const context = {
    emit: (frame: ServerFrame) => { frames.push(frame); },
    workspaces: workspaces as unknown as WorkspaceManager,
    peer: undefined,
    idle: overrides.idle ?? (() => true),    stopping: overrides.stopping ?? (() => false),
    provisioned,
  } satisfies ProvisionContext;
  return { context, frames, workspaces, provisioned };
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'serve-provision-')));
  initWorkspaceDir(root, path.join(root, '.claude.json'));
  vi.mocked(webSearch).mockReset();
  vi.mocked(webSearch).mockResolvedValue('1. [Vitest](https://vitest.dev)');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('provisionRemoteWorkspace', () => {
  it('completes provisioning while carrying an optional OAuth failure notice', async () => {
    const { context, frames, provisioned } = harness({ workspaces: {
      create: () => ({ dir: path.join(root, 'alpha'), ready: Promise.resolve(), oauthNotice: OPENCODE_OAUTH_FAILURE_NOTICE }),
    } });
    await provisionRemoteWorkspace(context, 'alpha', {}, {});
    expect(provisioned).toHaveBeenCalledOnce();
    expect(frames).toContainEqual(expect.objectContaining({ type: 'workspace-ready', notice: expect.stringContaining(OPENCODE_OAUTH_FAILURE_NOTICE) }));
    expect(frames.some((frame) => frame.type === 'workspace-failed')).toBe(false);
  });

  it('sends the remote home with workspace-ready', async () => {
    const { context, frames } = harness();

    await provisionRemoteWorkspace(context, 'alpha', {}, {});

    expect(frames).toContainEqual(expect.objectContaining({ type: 'workspace-ready', home: homedir() }));
  });

  it('sends how long the clone took to become ready with workspace-ready', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValueOnce(2000).mockReturnValueOnce(9500);
    const { context, frames } = harness();

    await provisionRemoteWorkspace(context, 'alpha', {}, {});

    expect(frames).toContainEqual(expect.objectContaining({ type: 'workspace-ready', elapsedMs: 7500 }));
    now.mockRestore();
  });

  it('clones as shallow as the launch asked, keeping every branch', async () => {
    const { context, workspaces } = harness();

    await provisionRemoteWorkspace(context, 'alpha', {}, {}, undefined, 1);

    expect(workspaces.create.mock.calls[0]?.[0]).toBe('alpha');
    expect(workspaces.create.mock.calls[0]?.[2]).toEqual({ depth: 1, allBranches: true });
  });

  it('clones the full history when the launch names no depth', async () => {
    const { context, workspaces } = harness();

    await provisionRemoteWorkspace(context, 'alpha', {}, {});

    expect(workspaces.create.mock.calls[0]).toHaveLength(2);
  });

  it('starts nothing when the server is no longer idle', async () => {
    const { context, frames, workspaces, provisioned } = harness({ idle: () => false });

    await provisionRemoteWorkspace(context, 'alpha', {}, {});

    expect(frames).toEqual([]);
    expect(workspaces.create).not.toHaveBeenCalled();
    expect(provisioned).not.toHaveBeenCalled();
  });

  it('refuses a leftover workspace it cannot clear, naming what blocked it', async () => {
    const { context, frames, workspaces } = harness({
      workspaces: { preflight: () => 'another tab is writing into this workspace' },
    });
    mkdirSync(workspacePath('alpha'), { recursive: true });

    await provisionRemoteWorkspace(context, 'alpha', {}, {});

    expect(frames).toEqual([{ type: 'workspace-failed', message: 'another tab is writing into this workspace' }]);
    expect(workspaces.create).not.toHaveBeenCalled();
  });

  it('answers a failed clone with the error and provisions no workspace', async () => {
    const setLabel = vi.fn();
    const { context, frames, provisioned } = harness({
      workspaces: { create: () => cloned(path.join(root, 'alpha'), Promise.reject(new Error('remote hung up'))) },
    });
    context.peer = { setLabel } as unknown as ProvisionContext['peer'];

    await provisionRemoteWorkspace(context, 'alpha', {}, {});

    expect(frames).toEqual([{ type: 'workspace-failed', message: 'remote hung up' }]);
    expect(provisioned).not.toHaveBeenCalled();
    expect(provisioned.mock.calls.some(([workspace]) => 'runClones' in workspace)).toBe(false);
  });

  it('removes every workspace and says nothing when the server stopped while cloning', async () => {
    const { context, frames, workspaces, provisioned } = harness({ stopping: () => true });

    await provisionRemoteWorkspace(context, 'alpha', {}, {});

    expect(workspaces.removeAll).toHaveBeenCalledOnce();
    expect(provisioned).not.toHaveBeenCalled();
    expect(frames).toEqual([]);
    expect(provisioned.mock.calls.some(([workspace]) => 'runClones' in workspace)).toBe(false);
  });

  it('records the label in the peer before it waits on the clone', async () => {
    const setLabel = vi.fn();
    const { context, workspaces } = harness();
    context.peer = { setLabel } as unknown as ProvisionContext['peer'];

    await provisionRemoteWorkspace(context, 'alpha', {}, {});

    expect(setLabel).toHaveBeenCalledWith('alpha');
    expect(setLabel.mock.invocationCallOrder[0]).toBeLessThan(workspaces.create.mock.invocationCallOrder[0]!);
  });

  it('gives a far-side web search the merged tokens, forwarded winning over the remote file', async () => {
    const home = path.join(root, 'home');
    const tavilyPath = path.join(root, '.janissary', 'tavily-token');
    const tinyfishPath = path.join(root, '.janissary', 'tinyfish-token');
    mkdirSync(path.dirname(tavilyPath), { recursive: true });
    writeFileSync(tavilyPath, 'tvly-own\n');
    writeFileSync(tinyfishPath, 'tfish-own\n');
    loadProjectTokens(root, home);
    try {
      const { context, provisioned } = harness();

      await provisionRemoteWorkspace(context, 'alpha', { tavily: 'tvly-forwarded' }, {});
      requestWebSearch(provisioned.mock.calls[0]![0]);

      await vi.waitFor(() => expect(webSearch).toHaveBeenCalledOnce());
      expect(vi.mocked(webSearch).mock.calls[0]?.[1].tokens).toEqual({
        tavily: 'tvly-forwarded', tinyfish: 'tfish-own',
      });
    } finally {
      rmSync(tavilyPath, { force: true });
      rmSync(tinyfishPath, { force: true });
      loadProjectTokens(root, home);
    }
  });

  it('gives a far-side web search no provider token when neither side has one', async () => {
    const home = path.join(root, 'home');
    loadProjectTokens(root, home);
    try {
      const { context, provisioned } = harness();

      await provisionRemoteWorkspace(context, 'alpha', {}, {});
      requestWebSearch(provisioned.mock.calls[0]![0]);

      await vi.waitFor(() => expect(webSearch).toHaveBeenCalledOnce());
      const tokens = vi.mocked(webSearch).mock.calls[0]?.[1].tokens;
      expect(tokens).not.toHaveProperty('tavily');
      expect(tokens).not.toHaveProperty('tinyfish');
    } finally {
      loadProjectTokens(root, home);
    }
  });
});

describe('provisionRemoteWorkspace — run clone service', () => {
  let home: string;

  function ownerHarness() {
    const tracked = new Set<string>();
    const workspaces = {
      create: vi.fn((label: string) => {
        const dir = path.join(root, label);
        tracked.add(dir);
        return cloned(dir, Promise.resolve());
      }),
      tracks: vi.fn((dir: string) => tracked.has(dir)),
      remove: vi.fn((dir: string) => { tracked.delete(dir); }),
      cancel: vi.fn(),
      preflight: vi.fn((): string | undefined => undefined),
      removeAll: vi.fn(),
    } as unknown as WorkspaceManager;
    const frames: ServerFrame[] = [];
    const provisioned = vi.fn<(workspace: ProvisionedWorkspace) => void>();
    const context = {
      emit: (frame: ServerFrame) => { frames.push(frame); },
      workspaces,
      peer: undefined,
      idle: () => true,
      stopping: () => false,
      provisioned,
    } satisfies ProvisionContext;
    return { context, workspaces, provisioned, frames };
  }

  function ownGithub(value: string | undefined): void {
    const dir = path.join(root, '.janissary');
    mkdirSync(dir, { recursive: true });
    if (value === undefined) rmSync(path.join(dir, 'github-token'), { force: true });
    else writeFileSync(path.join(dir, 'github-token'), `${value}\n`);
    loadProjectTokens(root, home);
  }

  async function provisionedOwner(forwarded: ProjectTokens, depth?: number) {
    const h = ownerHarness();
    await provisionRemoteWorkspace(h.context, 'alpha', forwarded, {}, undefined, depth);
    expect(h.provisioned).toHaveBeenCalledOnce();
    return { ...h, owner: h.provisioned.mock.calls[0][0] };
  }

  beforeEach(() => {
    home = path.join(root, 'home');
    mkdirSync(home, { recursive: true });
    ownGithub(undefined);
  });

  afterEach(() => { loadProjectTokens(root, home); });

  it('hands run clones the forwarded GitHub even when the far side has its own', async () => {
    ownGithub('own-github');
    const { owner, workspaces } = await provisionedOwner({ github: 'forwarded-github' }, 1);
    await owner.runClones.create('run-1');
    expect(workspaces.create.mock.calls[1][1]).toBe('forwarded-github');
  });

  it('falls back to the far side own GitHub when none is forwarded', async () => {
    ownGithub('own-github');
    const { owner, workspaces } = await provisionedOwner({});
    await owner.runClones.create('run-1');
    expect(workspaces.create.mock.calls[1][1]).toBe('own-github');
  });

  it('leaves GitHub absent on run clones when neither side has one', async () => {
    const { owner, workspaces } = await provisionedOwner({});
    await owner.runClones.create('run-1');
    expect(workspaces.create.mock.calls[1][1]).toBeUndefined();
  });

  it.each([undefined, 1, 10])('clones run clones at the agent depth regardless of main depth %s', async (depth) => {
    const { owner, workspaces } = await provisionedOwner({ github: 'forwarded-github' }, depth);
    await owner.runClones.create('run-1');
    expect(workspaces.create.mock.calls[1][2]).toEqual({ depth: AGENT_CLONE_DEPTH, allBranches: true });
  });

  it('creates and releases a run clone on the shared manager without changing the main owner', async () => {
    const { owner } = await provisionedOwner({ github: 'forwarded-github' });
    const main = { dir: owner.dir, processes: owner.processes, files: owner.files, acp: owner.acp };
    const result = await owner.runClones.create('run-1');
    expect(result.dir).toBe(path.join(root, 'run-1'));
    expect(await owner.runClones.release('run-1')).toEqual({});
    expect(owner.dir).toBe(main.dir);
    expect(owner.processes).toBe(main.processes);
    expect(owner.files).toBe(main.files);
    expect(owner.acp).toBe(main.acp);
  });

  it('gives the ACP host the same clone service it publishes', async () => {
    const { owner } = await provisionedOwner({ github: 'forwarded-github' });
    const result = await owner.runClones.create('run-1');
    const lookup = (owner.acp as unknown as { lookupWorkspace?: (label: string) => string | undefined }).lookupWorkspace;

    expect(lookup).toBeDefined();
    expect(lookup?.('run-1')).toBe(result.dir);
    expect(lookup?.('missing')).toBeUndefined();
  });

  it('publishes no service when the main clone fails', async () => {
    const h = ownerHarness();
    h.workspaces.create = vi.fn(() => ({ error: 'no origin' })) as unknown as WorkspaceManager['create'];
    h.context.workspaces = h.workspaces;
    await provisionRemoteWorkspace(h.context, 'alpha', {}, {});
    expect(h.provisioned).not.toHaveBeenCalled();
  });

  it('publishes no service when the server stops during main provisioning', async () => {
    const h = ownerHarness();
    h.context.stopping = () => true;
    await provisionRemoteWorkspace(h.context, 'alpha', {}, {});
    expect(h.provisioned).not.toHaveBeenCalled();
    expect(h.workspaces.removeAll).toHaveBeenCalledOnce();
  });
});
