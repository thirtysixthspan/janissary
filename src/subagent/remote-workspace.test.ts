import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createControllerTestProject } from '../controller/test-project.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import type { AgentRun } from '../agent/run.js';
import type { AgentSnapshot } from '../agent/types.js';
import type { ChannelTransport } from '../remote/channel/types.js';
import { RemoteChannel } from '../remote/channel/index.js';
import { encodeFrame, encodeHandshake } from '../remote/protocol.js';
import { deferred } from '../deferred.js';
import { prepareRemoteSubagentWorkspace, type RemoteSubagentWorkspace } from './remote-workspace.js';

const snapshot: AgentSnapshot = Object.freeze({ taskPath: 'task.md', taskText: '', skills: [], grants: [] });
const project = createControllerTestProject();

let controller: ReturnType<typeof project.create>;
let run: AgentRun;
let channel: RemoteChannel;
let written: string[];
let leaseRelease: ReturnType<typeof vi.fn>;
let workspace: RemoteSubagentWorkspace;
let autoCreate: boolean;
let createDir: string;
let createError: string | undefined;
let releaseError: string | undefined;

function requests() {
  return written.map((chunk) => JSON.parse(chunk.trim()) as { id: string; type: string; action: string; label: string })
    .filter((frame) => frame.type === 'run-clone');
}

function answer(id: string, result: object) {
  channel.receive(`${encodeFrame({ type: 'run-clone-result', id, ...result })}\n`);
}

async function flush(times = 10) {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

beforeEach(() => {
  controller = project.create();
  const caller = seedRootTab(controller.managers.tab);
  const captured = controller.managers.agent.captureCaller(caller);
  run = controller.managers.agent.create({ caller: captured, snapshot });

  written = [];
  autoCreate = true;
  createDir = '/remote/clone/ws';
  createError = undefined;
  releaseError = undefined;
  const transport: ChannelTransport = {
    id: 'pty1',
    write: (data) => {
      written.push(data);
      const frame = JSON.parse(data.trim()) as { type: string; id: string; action: string };
      if (frame.type !== 'run-clone') return;
      queueMicrotask(() => {
        if (frame.action === 'release') answer(frame.id, releaseError ? { error: releaseError } : {});
        else if (autoCreate) answer(frame.id, createError ? { error: createError } : { dir: createDir });
      });
    },
    kill: vi.fn(),
  };
  channel = new RemoteChannel(transport, {
    onTerminalData: () => {}, onAttached: () => {}, onFrame: () => {},
    onError: () => {}, onClose: () => {}, onTruncatedReplay: () => {},
  });
  channel.receive(`${encodeHandshake()}\n`);

  vi.spyOn(controller.managers.remote, 'get').mockReturnValue(channel);
  vi.spyOn(controller.managers.remote, 'addressOf').mockReturnValue({ host: 'devbox' } as never);
  leaseRelease = vi.fn(async () => {});
  vi.spyOn(controller.managers.remote, 'acquireAgentLease').mockReturnValue(leaseRelease);

  workspace = prepareRemoteSubagentWorkspace(controller.managers, channel, caller.label);
});

afterEach(async () => { await project.dispose(); vi.restoreAllMocks(); });

async function startAndCreate(): Promise<string> {
  workspace.start(run);
  await flush();
  expect(requests()[0]).toMatchObject({ action: 'create', label: `subagent-${run.id}` });
  await expect(workspace.ready).resolves.toBe(createDir);
  return createDir;
}

describe('prepareRemoteSubagentWorkspace — publication and startup', () => {
  it('starts no request or lease before start is called', () => {
    expect(requests()).toHaveLength(0);
    expect(leaseRelease).not.toHaveBeenCalled();
  });

  it('queues the create request after the publication microtask and resolves ready with the directory', async () => {
    workspace.start(run);
    expect(requests()).toHaveLength(0);
    await flush();
    expect(requests()).toHaveLength(1);
    await expect(workspace.ready).resolves.toBe('/remote/clone/ws');
  });

  it('refuses admission when publication already terminated the run', async () => {
    await run.finish('terminated');
    workspace.start(run);
    await expect(workspace.ready).rejects.toThrow('git clone cancelled.');
    expect(requests()).toHaveLength(0);
    expect(leaseRelease).not.toHaveBeenCalled();
  });

  it('termination after admission but before queued startup starts nothing', async () => {
    workspace.start(run);
    await controller.managers.agent.finish(run.id, 'terminated');
    await flush();
    await expect(workspace.ready).rejects.toThrow('git clone cancelled.');
    expect(requests()).toHaveLength(0);
    expect(leaseRelease).not.toHaveBeenCalled();
  });

  it('a label now pointing at a different channel refuses before lease or request', async () => {
    const other = new RemoteChannel(
      { id: 'pty2', write: () => {}, kill: vi.fn() },
      { onTerminalData: () => {}, onAttached: () => {}, onFrame: () => {}, onError: () => {}, onClose: () => {}, onTruncatedReplay: () => {} },
    );
    vi.spyOn(controller.managers.remote, 'get').mockReturnValue(other);
    workspace.start(run);
    await flush();
    await expect(workspace.ready).rejects.toThrow('Remote connection unavailable.');
    expect(requests()).toHaveLength(0);
    expect(leaseRelease).not.toHaveBeenCalled();
  });

  it('reentrant termination during lease acquisition releases the lease and starts no request', async () => {
    vi.spyOn(controller.managers.remote, 'acquireAgentLease').mockImplementation(() => {
      void controller.managers.agent.finish(run.id, 'terminated');
      return leaseRelease;
    });
    workspace.start(run);
    await flush();
    await expect(workspace.ready).rejects.toThrow('git clone cancelled.');
    expect(requests()).toHaveLength(0);
    expect(leaseRelease).toHaveBeenCalledOnce();
  });

  it('a closed channel refuses the request with source text and no frame', async () => {
    channel.close();
    workspace.start(run);
    await flush();
    await expect(workspace.ready).rejects.toThrow('Remote connection unavailable.');
    expect(requests()).toHaveLength(0);
  });

  it('an async create failure rejects ready with the original error text', async () => {
    createError = 'clone exploded';
    workspace.start(run);
    await flush();
    await expect(workspace.ready).rejects.toThrow('clone exploded');
  });
});

describe('prepareRemoteSubagentWorkspace — cancellation and release', () => {
  it('a pending create is released before readiness is awaited, then both drain', async () => {
    autoCreate = false;
    workspace.start(run);
    await flush();
    const [create] = requests();
    const release = workspace.release();
    await flush();
    expect(requests().filter((frame) => frame.action === 'release')).toHaveLength(1);
    answer(create.id, { dir: createDir });
    await release;
    expect(leaseRelease).toHaveBeenCalledOnce();
  });

  it('a late success after cancellation never resolves ready and still releases the clone', async () => {
    autoCreate = false;
    workspace.start(run);
    await flush();
    const [create] = requests();
    workspace.cancel();
    const release = workspace.release();
    answer(create.id, { dir: createDir });
    await release;
    await expect(workspace.ready).rejects.toThrow('git clone cancelled.');
    expect(requests().filter((frame) => frame.action === 'release')).toHaveLength(1);
    expect(leaseRelease).toHaveBeenCalledOnce();
  });

  it('a task-resolution style failure with no execution releases the clone normally', async () => {
    await startAndCreate();
    await workspace.release();
    expect(requests().filter((frame) => frame.action === 'release')).toHaveLength(1);
    expect(leaseRelease).toHaveBeenCalledOnce();
  });

  it('channel loss fails pending requests without replaying create and drops the lease once', async () => {
    autoCreate = false;
    workspace.start(run);
    await flush();
    expect(requests().filter((frame) => frame.action === 'create')).toHaveLength(1);
    channel.close();
    await expect(workspace.ready).rejects.toThrow('Remote connection lost.');
    await workspace.release();
    expect(requests().filter((frame) => frame.action === 'create')).toHaveLength(1);
    expect(leaseRelease).toHaveBeenCalledOnce();
  });

  it('a release error and a failing lease release still drop the lease once without replay', async () => {
    await startAndCreate();
    releaseError = 'release refused';
    leaseRelease.mockRejectedValueOnce(new Error('lease lost'));
    await expect(workspace.release()).resolves.toBeUndefined();
    expect(leaseRelease).toHaveBeenCalledOnce();
  });

  it('repeated finish shares one release and one lease drop', async () => {
    await startAndCreate();
    await Promise.all([workspace.release(), workspace.release(), workspace.release()]);
    expect(requests().filter((frame) => frame.action === 'release')).toHaveLength(1);
    expect(leaseRelease).toHaveBeenCalledOnce();
  });
});

describe('prepareRemoteSubagentWorkspace — execution barrier', () => {
  type Operation = { status: 'completed'; response: string; sessionId: string | null; cleanupWarnings: string[] };

  it('releases a ready clone only after execution finishes with no warnings', async () => {
    await startAndCreate();
    const operation = deferred<Operation>();
    const executing = workspace.trackExecution(() => operation.promise);
    const finishing = run.finish('completed');
    await flush();
    expect(requests().filter((frame) => frame.action === 'release')).toHaveLength(0);
    operation.resolve({ status: 'completed', response: 'done', sessionId: 's1', cleanupWarnings: [] });
    await executing;
    await finishing;
    expect(requests().filter((frame) => frame.action === 'release')).toHaveLength(1);
    expect(leaseRelease).toHaveBeenCalledOnce();
  });

  it('retains the clone but drops the lease last on a cleanup warning', async () => {
    await startAndCreate();
    const executing = workspace.trackExecution(async (): Promise<Operation> => ({
      status: 'completed', response: 'done', sessionId: 's1', cleanupWarnings: ['close not acknowledged'],
    }));
    const finishing = run.finish('completed');
    await executing;
    await finishing;
    expect(requests().filter((frame) => frame.action === 'release')).toHaveLength(0);
    expect(leaseRelease).toHaveBeenCalledOnce();
  });

  it('retains the clone on an unexpected executor rejection', async () => {
    await startAndCreate();
    const executing = workspace.trackExecution(() => Promise.reject(new Error('driver broke')));
    const finishing = run.finish('failed');
    await expect(executing).rejects.toThrow('driver broke');
    await finishing;
    expect(requests().filter((frame) => frame.action === 'release')).toHaveLength(0);
    expect(leaseRelease).toHaveBeenCalledOnce();
  });

  it('a synchronous termination inside the thunk does not deadlock the barrier', async () => {
    await startAndCreate();
    const operation = deferred<Operation>();
    const executing = workspace.trackExecution(() => {
      void controller.managers.agent.finish(run.id, 'terminated');
      return operation.promise;
    });
    await flush();
    expect(requests().filter((frame) => frame.action === 'release')).toHaveLength(0);
    operation.resolve({ status: 'terminated', response: 'Subagent terminated.', sessionId: null, cleanupWarnings: [] });
    await executing;
    await flush();
    expect(requests().filter((frame) => frame.action === 'release')).toHaveLength(1);
    expect(leaseRelease).toHaveBeenCalledOnce();
  });
});
