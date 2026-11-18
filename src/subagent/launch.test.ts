import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initWorkspaceDir, workspacePath } from '../workspace/index.js';
import { createControllerTestProject } from '../controller/test-project.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import { tabRuntime } from '../tab/runtime.js';
import type { Tab } from '../tab/types.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type { AcpRoleSettings } from '../acp/ask-role.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import type { ServerFrame } from '../remote/protocol-frames.js';
import { resolveRemoteAgentRequest } from '../remote/serve-agent-resolution.js';
import { RemoteRunClones } from '../remote/serve-run-clones.js';
import type { WorkspaceManager } from '../workspace/manager.js';
import { deferred } from '../deferred.js';
import type * as ExecuteModule from './execute.js';
import type * as TaskResolutionModule from '../agent/task-resolution.js';
import { launchSubagent, type SubagentLaunchOptions } from './launch.js';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), resolve: vi.fn() }));
vi.mock('./execute.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ExecuteModule>();
  return { ...actual, executeSubagentRun: mocks.execute };
});
vi.mock('../agent/task-resolution.js', async (importOriginal) => {
  const actual = await importOriginal<typeof TaskResolutionModule>();
  return { ...actual, resolveAgentSnapshot: mocks.resolve };
});

const project = createControllerTestProject();
const settings: AcpRoleSettings = { name: 'Research', entries: [{ harness: 'opencode', model: 'model-a' }], commands: ['file read'] };
const entries: [RoleEntry, ...RoleEntry[]] = [
  { harness: 'opencode', model: 'model-a' },
  { harness: 'opencode', model: 'model-b', effort: 'high' },
];

let scratch: string;
let controller: ReturnType<typeof project.create>;
let caller: Tab;
let provisioning: ReturnType<typeof deferred<void>>;
let create: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'subagent-launch-'));
  initWorkspaceDir(scratch, path.join(scratch, '.claude.json'));
  controller = project.create();
  caller = seedRootTab(controller.managers.tab);
  provisioning = deferred<void>();
  create = vi.spyOn(controller.managers.workspace, 'create').mockImplementation((name: string) => ({
    dir: workspacePath(name), ready: provisioning.promise, cancel: () => provisioning.resolve(),
  }));
  vi.spyOn(controller.managers.workspace, 'acquireAgentLease').mockReturnValue(vi.fn(async () => {}));
  mocks.execute.mockImplementation(async (options) => {
    options.onStarted?.('session-1');
    return { status: 'completed', response: 'answer', sessionId: 'session-1', cleanupWarnings: [] };
  });
  mocks.resolve.mockReturnValue({ taskPath: '/task.md', taskText: 'text', skills: [], grants: [] });
});

afterEach(async () => {
  provisioning.resolve();
  await project.dispose();
  rmSync(scratch, { recursive: true, force: true });
  vi.restoreAllMocks();
  mocks.execute.mockReset();
  mocks.resolve.mockReset();
});

async function drain(times = 40) {
  provisioning.resolve();
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

function launch(overrides: Partial<SubagentLaunchOptions> = {}) {
  return launchSubagent({
    label: caller.label, task: 'task.md', commandText: 'subagent --task task.md',
    settings, entries, ...overrides,
  }, controller.managers);
}

function record(receipt: ReturnType<typeof launch>) {
  return controller.managers.acpRecords.window(receipt.recordId)!;
}

function humanReplies() {
  return caller.log ?? [];
}

function onlyRun() {
  const runs = [...controller.managers.agent.runs.values()];
  expect(runs).toHaveLength(1);
  return runs[0];
}

function fakeRemote() {
  const cloneCreate = deferred<string>();
  queueMicrotask(() => cloneCreate.resolve('/remote/clone/ws'));
  const runClone = vi.fn((action: string) => action === 'create' ? cloneCreate.promise : Promise.resolve(undefined));
  const resolveAgentSnapshot = vi.fn(async () => ({ taskPath: '/remote/task.md', taskText: 'text', skills: [], grants: [] }));
  const channel = { runClone, resolveAgentSnapshot, attached: true } as unknown as RemoteChannel;
  vi.spyOn(controller.managers.remote, 'get').mockReturnValue(channel);
  vi.spyOn(controller.managers.remote, 'addressOf').mockReturnValue({ host: 'devbox' } as never);
  vi.spyOn(controller.managers.remote, 'acquireAgentLease').mockReturnValue(vi.fn(async () => {}));
  return { runClone, resolveAgentSnapshot, cloneCreate };
}

function invocation(overrides: Partial<CommandInvocationContext> = {}): CommandInvocationContext {
  return {
    runId: 'run-1', invocationId: 'inv-1', caller: { label: caller.label, cwd: caller.runtime?.cwd ?? '/cwd', context: [] },
    signal: new AbortController().signal, ...overrides,
  };
}

describe('launchSubagent — synchronous receipt and record', () => {
  it('returns a record receipt synchronously with a fresh reply id and canonical role name', () => {
    const receipt = launch();
    expect(receipt).toMatchObject({ kind: 'record', name: 'subagent:Research' });
    expect(receipt).toHaveProperty('replyId', expect.any(String));
    expect(receipt).toHaveProperty('recordId', expect.any(String));
    expect(create).not.toHaveBeenCalled();
  });

  it('publishes the durable record before any provisioning', () => {
    const receipt = launch();
    expect(controller.managers.acpRecords.rows()).toHaveLength(1);
    expect(record(receipt)).toMatchObject({ status: 'Running', subagentRole: 'Research' });
    expect(create).not.toHaveBeenCalled();
  });

  it('uses the invocation line as command, the first model, and default effort', () => {
    const receipt = launch({ invocation: invocation({ line: 'subagent --task exact.md' }) });
    expect(onlyRun().view()).toMatchObject({ command: 'subagent --task exact.md', model: 'model-a', effort: 'default' });
    expect(record(receipt).source).toMatchObject({ taskPath: 'task.md', subagentRole: 'Research' });
  });

  it('falls back to commandText and uses an explicit first effort', () => {
    launch({
      commandText: 'subagent typed line',
      entries: [{ harness: 'opencode', model: 'model-x', effort: 'medium' }, entries[1]],
    });
    expect(onlyRun().view()).toMatchObject({ command: 'subagent typed line', model: 'model-x', effort: 'medium' });
  });

  it('captures the remote host from the caller tab before publication', async () => {
    const remote = fakeRemote();
    const receipt = launch();
    const runId = onlyRun().id;
    expect(record(receipt).host).toBe('devbox');
    expect(remote.runClone).not.toHaveBeenCalled();
    await drain();
    expect(remote.runClone).toHaveBeenCalledWith('create', `subagent-${runId}`);
  });

  it('snapshots settings, invocation, offline and role against later mutation', async () => {
    const inv = invocation({ line: 'original line' });
    const callSettings: AcpRoleSettings = {
      name: 'Research', entries: [{ harness: 'opencode', model: 'model-a' }], commands: ['file read'],
    };
    launch({ invocation: inv, settings: callSettings });
    inv.caller.context.push('later');
    callSettings.entries[0].model = 'mutated';
    callSettings.commands.push('file write');
    await drain();
    const options = mocks.execute.mock.calls[0][0];
    expect(options.settings.entries[0].model).toBe('model-a');
    expect(options.settings.commands).toEqual(['file read']);
    expect(options.invocation.line).toBe('original line');
  });

  it('gives concurrent same-role runs distinct ids, records and clones', () => {
    const first = launch();
    const second = launch();
    expect(first.recordId).not.toBe(second.recordId);
    expect(first.replyId).not.toBe(second.replyId);
    expect(controller.managers.acpRecords.rows()).toHaveLength(2);
  });
});

describe('launchSubagent — caller capture', () => {
  it('throws for a missing caller and starts nothing', () => {
    expect(() => launchSubagent({
      label: 'missing', task: 'task.md', commandText: 'subagent t', settings, entries,
    }, controller.managers)).toThrow('Agent caller not found: missing');
    expect(create).not.toHaveBeenCalled();
  });

  it('throws for a closing caller', () => {
    tabRuntime(caller).closing = true;
    expect(() => launch()).toThrow('Agent caller is closing');
  });

  it('throws for a stale caller invocation', () => {
    expect(() => launch({ invocation: invocation({ caller: { label: caller.label, incarnation: 'old', cwd: '/cwd', context: [] } }) }))
      .toThrow('Agent caller is stale');
  });

  it('throws exactly for a missing ACP role, internal identity or provider id', () => {
    expect(() => launch({ invocation: invocation({ acpTool: true }) }))
      .toThrow('Subagent: caller session is not available.');
    vi.spyOn(controller.managers.acp, 'sessionIdentity').mockReturnValue('internal-1');
    expect(() => launch({ invocation: invocation({ acpTool: true, acpRole: 'ask' }) }))
      .toThrow('Subagent: caller session is not available.');
    expect(create).not.toHaveBeenCalled();
  });

  it('omits ACP metadata for a human caller', async () => {
    launch();
    const run = onlyRun();
    await drain();
    expect(mocks.execute.mock.calls[0][0].invocation.acpCaller).toBeUndefined();
    expect(run.acpCaller).toBeUndefined();
  });

  it('starts no provisioning when publication already terminated the run', async () => {
    launch();
    const run = [...controller.managers.agent.runs.values()][0];
    await controller.managers.agent.finish(run.id, 'terminated');
    await drain();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('launchSubagent — resolution and execution', () => {
  it('resolves locally with no skills and empty canonical commands', async () => {
    launch();
    await drain();
    expect(mocks.resolve).toHaveBeenCalledWith('task.md', [], {
      workspaceDir: expect.stringContaining('subagent-'), installationDir: expect.any(String),
    }, []);
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(humanReplies().some((entry) => entry.output.includes('started'))).toBe(true);
  });

  it('passes exactly the executor options with the resolved execution directory', async () => {
    launch();
    await drain();
    const options = mocks.execute.mock.calls[0][0];
    expect(options).toMatchObject({
      settings, entries, executionDir: expect.stringContaining('subagent-'),
      offline: caller.offline, onStarted: expect.any(Function),
    });
    expect(options.remote).toBeUndefined();
  });

  it('turns a resolver failure into one failed completion with no started reply', async () => {
    mocks.resolve.mockImplementation(() => { throw new Error('Agent: unknown task "task.md".'); });
    launch();
    await drain();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(humanReplies()).toHaveLength(1);
    expect(humanReplies()[0].output).toBe('Subagent Research failed.\n\nAgent: unknown task "task.md".');
  });

  it('leaves the run live when the invoking prompt aborts before or after launch', async () => {
    const controllerSignal = new AbortController();
    launch({ invocation: invocation({ signal: controllerSignal.signal }) });
    const run = onlyRun();
    controllerSignal.abort();
    await drain();
    expect(run.outcome).not.toBe('terminated');
    expect(run.abortController.signal.aborted).toBe(false);
  });

  it('starts no executor when termination happens before lookup', async () => {
    launch();
    const run = [...controller.managers.agent.runs.values()][0];
    await controller.managers.agent.finish(run.id, 'terminated');
    await drain();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('starts no executor when termination happens during remote resolution', async () => {
    const remote = fakeRemote();
    const resolution = deferred<{ taskPath: string; taskText: string; skills: []; grants: [] }>();
    remote.resolveAgentSnapshot.mockReturnValue(resolution.promise);
    launch();
    await drain();
    expect(mocks.execute).not.toHaveBeenCalled();
    const run = [...controller.managers.agent.runs.values()][0];
    await controller.managers.agent.finish(run.id, 'terminated');
    resolution.resolve({ taskPath: '/remote/task.md', taskText: 'text', skills: [], grants: [] });
    await drain();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('resolves remote tasks through the captured channel with the clone label', async () => {
    const remote = fakeRemote();
    remote.cloneCreate.resolve('/remote/clone/ws');
    launch();
    const runId = onlyRun().id;
    await drain();
    expect(remote.resolveAgentSnapshot).toHaveBeenCalledWith('task.md', [], `subagent-${runId}`);
    expect(mocks.execute.mock.calls[0][0]).toMatchObject({
      executionDir: '/remote/clone/ws',
      remote: { channel: expect.anything(), host: 'devbox', workspace: `subagent-${runId}` },
    });
  });

  it('resolves through the real far-side handler, which refuses a path selector', async () => {
    const cloneDir = '/remote/clone/ws';
    const workspaces = {
      create: vi.fn(() => ({ dir: cloneDir, ready: Promise.resolve(), cancel: vi.fn() })),
      tracks: vi.fn(() => false),
      remove: vi.fn(),
      cancel: vi.fn(),
    } as unknown as WorkspaceManager;
    const clones = new RemoteRunClones(workspaces, {} as never, 'main');
    const lookup = (label: string) => clones.lookup(label);
    const selectors: (string | undefined)[] = [];
    const resolveAgentSnapshot = vi.fn(async (task: string, skills: string[], workspace?: string) => {
      selectors.push(workspace);
      const frames: ServerFrame[] = [];
      resolveRemoteAgentRequest(
        { type: 'agent-resolve', id: 'req-1', task, skills, ...(workspace !== undefined && { workspace }) },
        '/main', (frame) => { frames.push(frame); }, lookup,
      );
      const frame = frames[0];
      if (frame?.type !== 'agent-resolve-result') throw new Error('no resolution result frame');
      if (frame.error !== undefined) throw new Error(frame.error);
      return frame.snapshot!;
    });
    const runClone = vi.fn(async (action: string, label: string) => {
      if (action === 'create') {
        const result = await clones.create(label);
        if (result.error !== undefined) throw new Error(result.error);
        return result.dir;
      }
      await clones.release(label);
      return;
    });
    const channel = { runClone, resolveAgentSnapshot, attached: true } as unknown as RemoteChannel;
    vi.spyOn(controller.managers.remote, 'get').mockReturnValue(channel);
    vi.spyOn(controller.managers.remote, 'addressOf').mockReturnValue({ host: 'devbox' } as never);
    vi.spyOn(controller.managers.remote, 'acquireAgentLease').mockReturnValue(vi.fn(async () => {}));

    launch();
    const label = `subagent-${onlyRun().id}`;
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce());
    await drain();

    expect(runClone).toHaveBeenCalledWith('create', label);
    expect(selectors).toEqual([label]);
    expect(mocks.execute.mock.calls[0][0].executionDir).toBe(cloneDir);

    const pathFrames: ServerFrame[] = [];
    resolveRemoteAgentRequest(
      { type: 'agent-resolve', id: 'req-2', task: 'task.md', skills: [], workspace: cloneDir },
      '/main', (frame) => { pathFrames.push(frame); }, lookup,
    );
    expect(pathFrames).toEqual([{
      type: 'agent-resolve-result', id: 'req-2', error: `Unknown remote run clone "${cloneDir}".`,
    }]);
  });

  it('turns a clone error object into one failed completion after the receipt', async () => {
    create.mockImplementation(() => ({ error: 'no space left' }));
    const receipt = launch();
    await drain();
    expect(receipt).toHaveProperty('recordId');
    expect(humanReplies()).toHaveLength(1);
    expect(humanReplies()[0].output).toContain('no space left');
  });

  it('turns a thrown clone create into one failed completion', async () => {
    create.mockImplementation(() => { throw new Error('create refused'); });
    launch();
    await drain();
    expect(humanReplies()).toHaveLength(1);
    expect(humanReplies()[0].output).toContain('create refused');
  });

  it('turns an async clone rejection into one failed completion', async () => {
    provisioning.reject(new Error('clone rejected'));
    launch();
    await drain();
    expect(humanReplies()).toHaveLength(1);
    expect(humanReplies()[0].output).toContain('clone rejected');
  });
});
