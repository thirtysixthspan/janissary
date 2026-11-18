import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type * as Workspace from '../workspace/index.js';
import type { WorkspaceManager } from '../workspace/manager.js';
import type { FreshAgentWorkspace } from './fresh-workspace.js';
import type { AgentCaller, AgentRun } from './run.js';
import { settleAgentRun } from './settle-run.js';
import { createControllerTestProject } from '../controller/test-project.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';

const findRepoRootMock = vi.fn();
const getRemoteUrlMock = vi.fn();
const provisionWorkspaceMock = vi.fn();
const removeWorkspaceMock = vi.fn();
const removeWorkspaceStrictMock = vi.fn();

vi.mock('../workspace/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Workspace>();
  return {
    ...actual,
    findRepoRoot: (...args: unknown[]) => findRepoRootMock(...args),
    getRemoteUrl: (...args: unknown[]) => getRemoteUrlMock(...args),
    provisionWorkspace: (...args: unknown[]) => provisionWorkspaceMock(...args),
    removeWorkspace: (...args: unknown[]) => removeWorkspaceMock(...args),
    removeWorkspaceStrict: (...args: unknown[]) => removeWorkspaceStrictMock(...args),
  };
});

const { initWorkspaceDir, workspacePath } = await import('../workspace/index.js');
const { prepareFreshAgentWorkspace } = await import('./fresh-workspace.js');

const project = createControllerTestProject();
let scratch: string;
let controller: ReturnType<typeof project.create>;
let captured: AgentCaller;
let workspace: WorkspaceManager;
let provisioning: ReturnType<typeof Promise.withResolvers<void>>;
let perHandleCancel: ReturnType<typeof vi.fn>;

beforeEach(() => {
  for (const mock of [findRepoRootMock, getRemoteUrlMock, provisionWorkspaceMock, removeWorkspaceMock, removeWorkspaceStrictMock]) mock.mockReset();
  scratch = mkdtempSync(path.join(os.tmpdir(), 'fresh-workspace-'));
  initWorkspaceDir(scratch, path.join(scratch, '.claude.json'));
  findRepoRootMock.mockReturnValue('/repo');
  getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
  provisioning = Promise.withResolvers<void>();
  perHandleCancel = vi.fn(() => provisioning.resolve());
  provisionWorkspaceMock.mockImplementation((name: string) => ({
    dir: workspacePath(name), ready: provisioning.promise, cancel: perHandleCancel,
  }));
  controller = project.create();
  captured = controller.managers.agent.captureCaller(seedRootTab(controller.managers.tab));
  workspace = controller.managers.workspace;
});

afterEach(async () => {
  provisioning.resolve();
  await project.dispose();
  rmSync(scratch, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function startFresh(): { handle: FreshAgentWorkspace; run: AgentRun } {
  const handle = prepareFreshAgentWorkspace(workspace);
  const run = controller.managers.agent.create({
    caller: captured,
    snapshot: { taskPath: 'task.md', taskText: '', skills: [], grants: [] },
    executionDir: handle.dir,
    executionWorkspace: handle.dir,
    releaseWorkspace: handle.release,
    command: 'agent execute task.md',
  });
  handle.start(run);
  return { handle, run };
}

function window(run: AgentRun) {
  return controller.managers.acpRecords.window(run.recordId!)!;
}

async function settle(run: AgentRun, outcome: 'completed' | 'failed' | 'terminated') {
  return settleAgentRun(run, outcome, controller.managers);
}

describe('prepareFreshAgentWorkspace', () => {
  it('transfers the creator reference to the run and deletes the clone on final release', async () => {
    const { handle, run } = startFresh();
    await Promise.resolve();
    expect(provisionWorkspaceMock).toHaveBeenCalledOnce();
    expect(workspace.tracks(handle.dir)).toBe(true);

    provisioning.resolve();
    await expect(handle.ready).resolves.toBeUndefined();
    await settle(run, 'completed');

    expect(removeWorkspaceStrictMock).toHaveBeenCalledExactlyOnceWith(handle.dir);
    expect(workspace.tracks(handle.dir)).toBe(false);
    expect(window(run).status).toBe('Completed');
  });

  it('rejects a synchronous create refusal and leaves a Failed record without a prompt', async () => {
    findRepoRootMock.mockReturnValue(undefined);
    const { handle, run } = startFresh();
    await Promise.resolve();

    await expect(handle.ready).rejects.toThrow('No git repository found. Cannot create workspace.');
    expect(provisionWorkspaceMock).not.toHaveBeenCalled();
    await settle(run, 'failed');
    expect(window(run)).toMatchObject({ status: 'Failed', blocks: [] });
  });

  it('propagates a synchronous thrown create error unchanged', async () => {
    provisionWorkspaceMock.mockImplementation(() => { throw new Error('preflight boom'); });
    const { handle, run } = startFresh();
    await Promise.resolve();

    await expect(handle.ready).rejects.toThrow('preflight boom');
    await settle(run, 'failed');
    expect(window(run)).toMatchObject({ status: 'Failed', blocks: [] });
  });

  it('propagates an asynchronous clone rejection unchanged', async () => {
    const { handle, run } = startFresh();
    await Promise.resolve();
    provisioning.reject(new Error('clone failed'));

    await expect(handle.ready).rejects.toThrow('clone failed');
    const warnings = await settle(run, 'failed');
    expect(warnings).toEqual([]);
    expect(window(run)).toMatchObject({ status: 'Failed', blocks: [] });
    expect(removeWorkspaceStrictMock).toHaveBeenCalledWith(handle.dir);
  });

  it('cleans the creator reference when lease acquisition fails after create', async () => {
    vi.spyOn(workspace, 'acquireAgentLease').mockImplementation(() => { throw new Error('lease refused'); });
    const { handle, run } = startFresh();
    await Promise.resolve();

    await expect(handle.ready).rejects.toThrow('lease refused');
    await settle(run, 'failed');
    expect(removeWorkspaceMock).toHaveBeenCalledWith(handle.dir);
    expect(removeWorkspaceStrictMock).not.toHaveBeenCalled();
    expect(window(run)).toMatchObject({ status: 'Failed', blocks: [] });
  });

  it('skips cloning when the run ends before the queued startup', async () => {
    const { handle, run } = startFresh();
    const finishing = controller.managers.agent.finish(run.id, 'terminated');
    await Promise.resolve();

    expect(provisionWorkspaceMock).not.toHaveBeenCalled();
    await expect(handle.ready).rejects.toThrow('git clone cancelled.');
    await finishing;
    expect(window(run).status).toBe('Terminated');
  });

  it('cancels before readiness settles and deletion during a pending clone', async () => {
    const events: string[] = [];
    void provisioning.promise.then(() => { events.push('settled'); }, () => { events.push('settled'); });
    provisionWorkspaceMock.mockImplementation((name: string) => ({
      dir: workspacePath(name), ready: provisioning.promise,
      cancel: () => { events.push('cancel'); provisioning.resolve(); },
    }));
    removeWorkspaceStrictMock.mockImplementation(() => { events.push('delete'); });

    const { handle, run } = startFresh();
    await Promise.resolve();
    await controller.managers.agent.finish(run.id, 'terminated');

    expect(events).toEqual(['cancel', 'settled', 'delete']);
    await expect(handle.ready).resolves.toBeUndefined();
    expect(window(run).status).toBe('Terminated');
  });

  it('registers a lease acquired after the run ends inside create', async () => {
    const handle = prepareFreshAgentWorkspace(workspace);
    let finishing: Promise<void> | undefined;
    provisionWorkspaceMock.mockImplementation((name: string) => {
      finishing = controller.managers.agent.finish(run.id, 'terminated');
      return { dir: workspacePath(name), ready: provisioning.promise, cancel: perHandleCancel };
    });
    const run = controller.managers.agent.create({
      caller: captured,
      snapshot: { taskPath: 'task.md', taskText: '', skills: [], grants: [] },
      executionDir: handle.dir,
      executionWorkspace: handle.dir,
      releaseWorkspace: handle.release,
      command: 'agent execute task.md',
    });
    handle.start(run);
    await Promise.resolve();
    await finishing;

    expect(removeWorkspaceStrictMock).toHaveBeenCalledExactlyOnceWith(handle.dir);
    expect(window(run).status).toBe('Terminated');
  });

  it('rejects admission and schedules no clone when the run ended at publication', async () => {
    let finishing: Promise<void> | undefined;
    const original = controller.managers.agent.create.bind(controller.managers.agent);
    vi.spyOn(controller.managers.agent, 'create').mockImplementation((options) => {
      const run = original(options);
      finishing = controller.managers.agent.finish(run.id, 'terminated');
      return run;
    });

    const handle = prepareFreshAgentWorkspace(workspace);
    const run = controller.managers.agent.create({
      caller: captured,
      snapshot: { taskPath: 'task.md', taskText: '', skills: [], grants: [] },
      executionDir: handle.dir,
      executionWorkspace: handle.dir,
      releaseWorkspace: handle.release,
      command: 'agent execute task.md',
    });
    handle.start(run);
    await Promise.resolve();

    expect(provisionWorkspaceMock).not.toHaveBeenCalled();
    await expect(handle.ready).rejects.toThrow('git clone cancelled.');
    await finishing;
  });

  it('cancels and releases only once across repeated cleanup and cancel calls', async () => {
    const { handle, run } = startFresh();
    await Promise.resolve();
    await controller.managers.agent.finish(run.id, 'terminated');
    handle.cancel();
    await handle.release();
    await handle.release();

    expect(perHandleCancel).toHaveBeenCalledOnce();
    expect(removeWorkspaceStrictMock).toHaveBeenCalledOnce();
  });

  it('uses the manager fallback when the provisioned handle has no cancel', async () => {
    const actual = controller.managers.workspace.create.bind(controller.managers.workspace);
    vi.spyOn(controller.managers.workspace, 'create').mockImplementation((...args: Parameters<typeof actual>) => {
      const result = actual(...args);
      if ('error' in result) return result;
      const { cancel, ...rest } = result;
      void cancel;
      return rest;
    });
    const managerCancel = vi.spyOn(controller.managers.workspace, 'cancel');

    const { run } = startFresh();
    await Promise.resolve();
    await controller.managers.agent.finish(run.id, 'terminated');

    expect(managerCancel).toHaveBeenCalledOnce();
    expect(perHandleCancel).toHaveBeenCalledOnce();
  });

  it('keeps the clone while another holder retains it', async () => {
    const { handle, run } = startFresh();
    await Promise.resolve();
    workspace.retain(handle.dir);
    provisioning.resolve();
    await handle.ready;
    await settle(run, 'completed');

    expect(removeWorkspaceStrictMock).not.toHaveBeenCalled();
    expect(workspace.tracks(handle.dir)).toBe(true);
    workspace.release(handle.dir);
    expect(removeWorkspaceMock).toHaveBeenCalledWith(handle.dir);
  });

  it('reports a final deletion failure separately from the run outcome', async () => {
    removeWorkspaceStrictMock.mockImplementation(() => { throw new Error('remove failed'); });
    const { handle, run } = startFresh();
    await Promise.resolve();
    provisioning.reject(new Error('clone failed'));
    await expect(handle.ready).rejects.toThrow('clone failed');

    const warnings = await settle(run, 'failed');
    expect(warnings).toEqual(['remove failed']);
    expect(window(run)).toMatchObject({ status: 'Failed', blocks: [] });
  });

  it('observes a deferred rejection with no immediate consumer', async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', listener);
    try {
      const handle = prepareFreshAgentWorkspace(workspace);
      handle.cancel();
      await new Promise<void>((resolve) => { setImmediate(resolve); });
      await expect(handle.ready).rejects.toThrow('git clone cancelled.');
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', listener);
    }
  });
});
