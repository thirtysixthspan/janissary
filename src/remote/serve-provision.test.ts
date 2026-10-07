import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { provisionRemoteWorkspace, type ProvisionContext, type ProvisionedWorkspace } from './serve-provision.js';
import { initWorkspaceDir, workspacePath } from '../workspace/index.js';
import type { WorkspaceManager } from '../workspace/manager.js';
import type { ServerFrame } from './protocol-frames.js';

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
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('provisionRemoteWorkspace', () => {
  it('sends the remote home with workspace-ready', async () => {
    const { context, frames } = harness();

    await provisionRemoteWorkspace(context, 'alpha', {}, {});

    expect(frames).toContainEqual(expect.objectContaining({ type: 'workspace-ready', home: homedir() }));
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
  });

  it('removes every workspace and says nothing when the server stopped while cloning', async () => {
    const { context, frames, workspaces, provisioned } = harness({ stopping: () => true });

    await provisionRemoteWorkspace(context, 'alpha', {}, {});

    expect(workspaces.removeAll).toHaveBeenCalledOnce();
    expect(provisioned).not.toHaveBeenCalled();
    expect(frames).toEqual([]);
  });

  it('records the label in the peer before it waits on the clone', async () => {
    const setLabel = vi.fn();
    const { context, workspaces } = harness();
    context.peer = { setLabel } as unknown as ProvisionContext['peer'];

    await provisionRemoteWorkspace(context, 'alpha', {}, {});

    expect(setLabel).toHaveBeenCalledWith('alpha');
    expect(setLabel.mock.invocationCallOrder[0]).toBeLessThan(workspaces.create.mock.invocationCallOrder[0]!);
  });
});
