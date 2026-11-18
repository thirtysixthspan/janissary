import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initWorkspaceDir } from '../workspace/index.js';
import { createControllerTestProject } from '../controller/test-project.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import { writeRolesFile, type Role } from '../plugins/roles/roles-file.js';
import { RemoteChannel } from '../remote/channel/index.js';
import type { ChannelTransport } from '../remote/channel/types.js';
import { encodeFrame, encodeHandshake } from '../remote/protocol.js';
import type { AcpLoopHandlers } from '../acp/types.js';
import type { RemoteAcpHooks, RemoteAcpSession } from '../remote/acp-session.js';
import type * as RemoteAcpModule from '../remote/acp-session.js';
import { runSubagentCommand } from './command-policy.js';

const mocks = vi.hoisted(() => ({
  createRemoteAcpSession: vi.fn(),
}));
vi.mock('../remote/acp-session.js', async (importOriginal) => {
  const actual = await importOriginal<typeof RemoteAcpModule>();
  return { ...actual, createRemoteAcpSession: (...args: unknown[]) => mocks.createRemoteAcpSession(...args) };
});

const project = createControllerTestProject();
const RESEARCH: Role = {
  name: 'research',
  description: 'Research role for remote integration coverage.',
  entries: [{ harness: 'opencode', model: 'model-a', effort: 'medium' }],
  commands: ['file read', 'file write', 'subagent'],
};

let scratch: string;
let controller: ReturnType<typeof project.create>;
let caller: ReturnType<typeof seedRootTab>;
let channel: RemoteChannel;
let written: string[];
let releaseAck: () => Promise<boolean>;
let remoteHooks: RemoteAcpHooks[];
let remoteEvents: AcpLoopHandlers[];
let createOptions: Array<{ workspace?: string }>;
let cloneRequests: string[];

type ControlledRemote = RemoteAcpSession;

function controlledRemote(): ControlledRemote {
  return {
    remote: true,
    run: vi.fn((_text, _snapshot, _runCaller, events: AcpLoopHandlers) => { remoteEvents.push(events); }),
    ready: Promise.resolve(true),
    release: vi.fn(() => releaseAck()),
    cancel: vi.fn(async () => {}),
    kill: vi.fn(),
    shutdown: vi.fn(async () => {}),
  } as unknown as ControlledRemote;
}

beforeEach(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'subagent-remote-integration-'));
  initWorkspaceDir(scratch, path.join(scratch, '.claude.json'));
  controller = project.create();
  writeRolesFile(path.join(controller.managers.tab.launchDir, '.janissary', 'roles.json'), [RESEARCH]);
  caller = seedRootTab(controller.managers.tab);
  written = [];
  releaseAck = vi.fn(async () => true);
  remoteHooks = [];
  remoteEvents = [];
  createOptions = [];
  cloneRequests = [];

  const transport: ChannelTransport = {
    id: 'pty-remote',
    write: (data) => {
      written.push(data);
      const frame = JSON.parse(data.trim()) as { type: string; id: string; action: string };
      if (frame.type !== 'run-clone') return;
      cloneRequests.push(frame.action);
      queueMicrotask(() => {
        const result = frame.action === 'create' ? { dir: '/remote/clone/research' } : {};
        channel.receive(`${encodeFrame({ type: 'run-clone-result', id: frame.id, ...result })}\n`);
      });
    },
    kill: vi.fn(),
  };
  channel = new RemoteChannel(transport, {
    onTerminalData: () => {}, onAttached: () => {}, onFrame: () => {},
    onError: () => {}, onClose: () => {}, onTruncatedReplay: () => {},
  });
  channel.receive(`${encodeHandshake()}\n`);
  vi.spyOn(channel, 'resolveAgentSnapshot').mockResolvedValue({
    taskPath: 'task.md', taskText: 'REMOTE TASK', skills: [], grants: [],
  });

  vi.spyOn(controller.managers.models, 'isKnownModel').mockReturnValue(true);
  vi.spyOn(controller.managers.remote, 'get').mockReturnValue(channel);
  vi.spyOn(controller.managers.remote, 'addressOf').mockReturnValue({ host: 'devbox' } as never);
  vi.spyOn(controller.managers.remote, 'acquireAgentLease').mockReturnValue(vi.fn(async () => {}));

  mocks.createRemoteAcpSession.mockReset();
  mocks.createRemoteAcpSession.mockImplementation((_channel, options, hooks: RemoteAcpHooks) => {
    createOptions.push(options);
    remoteHooks.push(hooks);
    return controlledRemote();
  });
});

afterEach(async () => {
  await project.dispose();
  rmSync(scratch, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function drain(times = 120): Promise<void> {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

function launch() {
  return runSubagentCommand(
    'subagent --role research --task task.md --context "remote query"',
    caller, controller.managers,
  );
}
function frames(): Array<{ type: string; action?: string }> {
  return written.map((chunk) => JSON.parse(chunk.trim()) as { type: string; action?: string });
}
function answer(text: string): void {
  const events = remoteEvents.at(-1)!;
  events.endTurn(text);
  events.finished('answered', 8);
}

describe('subagent remote integration — established channel clone lifecycle', () => {
  it('creates a fresh remote clone, resolves and executes there, then releases clone before its lease', async () => {
    const receipt = launch()!;
    expect(receipt).toHaveProperty('recordId');
    await drain();

    const run = [...controller.managers.agent.runs.values()][0]!;
    expect(cloneRequests).toEqual(['create']);
    expect(frames().some((frame) => frame.type === 'run-clone' && frame.action === 'create')).toBe(true);
    expect(channel.resolveAgentSnapshot).toHaveBeenCalledWith('task.md', [], `subagent-${run.id}`);
    expect(createOptions[0]!.workspace).toBe(`subagent-${run.id}`);

    remoteHooks[0]!.onSessionStarted?.('provider-remote');
    answer('remote distilled result');
    await drain();

    const replies = caller.log ?? [];
    expect(replies.map((entry) => entry.output)).toContain('Subagent research started.');
    expect(replies.at(-1)!.output).toBe('Subagent research completed.\n\nremote distilled result');
    expect(cloneRequests).toEqual(['create', 'release']);
  });

  it('retains a ready clone when execution reports a cleanup warning, releasing only the lease', async () => {
    launch();
    await drain();
    remoteHooks[0]!.onSessionStarted?.('provider-remote');
    (mocks.createRemoteAcpSession.mock.results[0]!.value as ControlledRemote).release = vi.fn(async () => false);
    answer('result despite warning');
    await drain();

    expect(cloneRequests).toEqual(['create']);
    expect(frames().some((frame) => frame.type === 'run-clone' && frame.action === 'release')).toBe(false);
  });

  it('retains the clone when the close acknowledgement is false', async () => {
    releaseAck = vi.fn(async () => false);
    launch();
    await drain();
    remoteHooks[0]!.onSessionStarted?.('provider-remote');
    answer('acknowledged result');
    await drain();

    expect(cloneRequests).toEqual(['create']);
    expect(frames().some((frame) => frame.type === 'run-clone' && frame.action === 'release')).toBe(false);
  });

  it('starts no clone or remote session when the run is terminated before startup', async () => {
    launch();
    const run = [...controller.managers.agent.runs.values()][0]!;
    await controller.managers.agent.finish(run.id, 'terminated');
    await drain();

    expect(cloneRequests).toEqual([]);
    expect(mocks.createRemoteAcpSession).not.toHaveBeenCalled();
    expect((caller.log ?? []).at(-1)!.output).toContain('Subagent terminated.');
  });

  it('records the remote host and uses the returned clone directory, never the caller path', async () => {
    const receipt = launch()!;
    await drain();
    const record = controller.managers.acpRecords.window(receipt.recordId)!;
    expect(record.host).toBe('devbox');
    expect(controller.managers.remote.get).toHaveBeenCalledWith(caller.label);
    remoteHooks[0]!.onSessionStarted?.('provider-remote');
    answer('done');
    await drain();
    expect(cloneRequests).toContain('release');
  });
});
