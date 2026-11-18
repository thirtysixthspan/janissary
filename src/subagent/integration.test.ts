import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initWorkspaceDir, workspacePath } from '../workspace/index.js';
import { createControllerTestProject } from '../controller/test-project.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import { tabRuntime } from '../tab/runtime.js';
import { writeRolesFile, type Role } from '../plugins/roles/roles-file.js';
import { deferred } from '../deferred.js';
import type { AcpPromptHandlers, AcpSession, AcpPromptResult } from '../acp/types.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type * as DriveLoop from '../acp/drive-loop.js';
import type * as TaskResolution from '../agent/task-resolution.js';
import { runSubagentCommand } from './command-policy.js';

type ConnectOptions = {
  cwd: string;
  onError: (message: string) => void;
  onSessionStarted?: (id: string) => void;
  onActivity?: (activity: unknown) => void;
};

type RunToolLoop = (...args: unknown[]) => void;

const mocks = vi.hoisted(() => ({
  connectAcp: vi.fn(),
  runToolLoop: vi.fn(),
  realRunToolLoop: undefined as unknown as RunToolLoop,
  resolve: vi.fn(),
}));

vi.mock('../acp/index.js', () => ({ connectAcp: mocks.connectAcp }));
vi.mock('../acp/drive-loop.js', async (importOriginal) => {
  const actual = await importOriginal<typeof DriveLoop>();
  mocks.realRunToolLoop = actual.runToolLoop;
  return { ...actual, runToolLoop: (...args: unknown[]) => mocks.runToolLoop(...args) };
});
vi.mock('../agent/task-resolution.js', async (importOriginal) => {
  const actual = await importOriginal<typeof TaskResolution>();
  return { ...actual, resolveAgentSnapshot: (...args: unknown[]) => mocks.resolve(...args) };
});

const project = createControllerTestProject();
const RESEARCH: Role = {
  name: 'research',
  description: 'Research role for integration coverage.',
  entries: [{ harness: 'opencode', model: 'model-a', effort: 'medium' }],
  commands: ['file read', 'file write', 'subagent'],
};
const FALLBACK_ROLE: Role = {
  ...RESEARCH,
  entries: [
    { harness: 'opencode', model: 'model-a', effort: 'medium' },
    { harness: 'opencode', model: 'model-b', effort: 'high' },
  ],
};
function useRole(role: Role): void {
  writeRolesFile(path.join(controller.managers.tab.launchDir, '.janissary', 'roles.json'), [role]);
}
const TASK_TEXT = 'TASK BODY\nwith a second line';

let scratch: string;
let controller: ReturnType<typeof project.create>;
let caller: ReturnType<typeof seedRootTab>;
let provisioning: ReturnType<typeof deferred<void>>;
let deliveries: string[];
let connectCalls: ConnectOptions[];
let sessionQueue: AcpSession[];
let sessionPrompts: Array<ReturnType<typeof vi.fn>>;

function providerSession(): AcpSession {
  return {
    prompt: vi.fn(), cancel: vi.fn(async () => {}), kill: vi.fn(), shutdown: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'subagent-integration-'));
  initWorkspaceDir(scratch, path.join(scratch, '.claude.json'));
  controller = project.create();
  const launchDir = controller.managers.tab.launchDir;
  writeRolesFile(path.join(launchDir, '.janissary', 'roles.json'), [RESEARCH]);
  caller = seedRootTab(controller.managers.tab);
  provisioning = deferred<void>();
  deliveries = [];
  connectCalls = [];
  sessionPrompts = [];
  sessionQueue = [providerSession(), providerSession(), providerSession(), providerSession()];

  vi.spyOn(controller.managers.models, 'isKnownModel').mockReturnValue(true);
  vi.spyOn(controller.managers.workspace, 'create').mockImplementation((name: string) => ({
    dir: workspacePath(name), ready: provisioning.promise, cancel: () => provisioning.resolve(),
  }));
  vi.spyOn(controller.managers.workspace, 'acquireAgentLease').mockReturnValue(vi.fn(async () => {}));

  mocks.resolve.mockReturnValue({ taskPath: 'task.md', taskText: TASK_TEXT, skills: [], grants: [] });
  mocks.runToolLoop.mockReset();
  mocks.connectAcp.mockReset();
  mocks.connectAcp.mockImplementation((options: ConnectOptions) => {
    connectCalls.push(options);
    const session = sessionQueue.shift() ?? providerSession();
    sessionPrompts.push(session.prompt as ReturnType<typeof vi.fn>);
    return session;
  });
  vi.spyOn(controller.managers.acp, 'sessionIdentity').mockReturnValue('identity-1');
  vi.spyOn(controller.managers.acp, 'providerSessionId').mockReturnValue('provider-caller-1');
  vi.spyOn(controller.managers.acp, 'promptResult').mockImplementation(async (_label, prompt) => {
    deliveries.push(prompt);
    return { answered: true, reply: 'ack' } as AcpPromptResult;
  });
  const rt = tabRuntime(caller);
  (rt.acpRoles ??= {}).tell = {};
  (rt.acpRoles as Record<string, unknown>).ask = {};
});

afterEach(async () => {
  provisioning.resolve();
  await project.dispose();
  rmSync(scratch, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function drain(times = 80): Promise<void> {
  return (async () => {
    provisioning.resolve();
    for (let index = 0; index < times; index += 1) await Promise.resolve();
  })();
}

async function withRealLoop(run: () => Promise<void>): Promise<void> {
  await mocks.runToolLoop.withImplementation(mocks.realRunToolLoop, run);
}
function loopPrompt(index: number): string {
  return mocks.runToolLoop.mock.calls[index]![1] as string;
}
function handshake(index: number, id: string): void {
  connectCalls[index]?.onSessionStarted?.(id);
}
function latestProviderPrompt(index: number): AcpPromptHandlers {
  return sessionPrompts[index]!.mock.calls.at(-1)![1] as AcpPromptHandlers;
}
function answer(index: number, text: string): void {
  const handlers = latestProviderPrompt(index);
  handlers.onChunk(text);
  handlers.onEnd('end_turn');
}
function fail(index: number, message: string): void {
  latestProviderPrompt(index).onError(message);
}
function humanReplies() {
  return caller.log ?? [];
}
function runs() {
  return [...controller.managers.agent.runs.values()];
}
function onlyRun() {
  const found = runs();
  expect(found).toHaveLength(1);
  return found[0]!;
}
function launch(command = 'subagent --role research --task task.md --context "What is X?"') {
  return runSubagentCommand(command, caller, controller.managers);
}
function acpInvocation(role: 'ask' | 'tell' = 'tell'): CommandInvocationContext {
  return {
    runId: 'caller-run', invocationId: 'caller-inv',
    caller: { label: caller.label, cwd: caller.runtime?.cwd ?? '/cwd', context: [] },
    signal: new AbortController().signal, acpTool: true, acpRole: role,
    line: 'subagent {"role":"research","task":"task.md","context":"What is X?"}',
  };
}

describe('subagent integration — local command to human reply', () => {
  it('publishes the durable record and receipt synchronously, before provisioning', async () => {
    await withRealLoop(async () => {
      const receipt = launch();
      expect(receipt).toMatchObject({ kind: 'record', name: 'subagent:research' });
      expect(receipt).toHaveProperty('replyId', expect.any(String));
      expect(receipt).toHaveProperty('recordId', expect.any(String));
      const record = controller.managers.acpRecords.window(receipt!.recordId)!;
      expect(record).toMatchObject({ status: 'Running', subagentRole: 'research', title: 'Subagent: task.md' });
      expect(controller.managers.workspace.create).not.toHaveBeenCalled();
    });
  });

  it('runs the resolved task verbatim and preserves the distilled output in the human completion', async () => {
    await withRealLoop(async () => {
      const receipt = launch()!;
      await drain();
      expect(loopPrompt(0)).toContain(TASK_TEXT);
      expect(loopPrompt(0)).toContain('What is X?');
      expect(mocks.resolve).toHaveBeenCalledWith('task.md', [], expect.objectContaining({ workspaceDir: expect.stringContaining('subagent-') }), []);

      handshake(0, 'provider-A');
      answer(0, '**distilled** "quoted" \\ path\nnext line');
      await drain();

      const replies = humanReplies();
      expect(replies).toHaveLength(2);
      expect(replies[0]!.output).toBe('Subagent research started.');
      expect(replies[0]!.background).toEqual(expect.any(String));
      expect(replies[0]!.background).not.toBe(receipt.replyId);
      expect(replies[0]).not.toHaveProperty('backgroundRecord');
      expect(replies[1]!.output).toBe('Subagent research completed.\n\n**distilled** "quoted" \\ path\nnext line');
      expect(replies[1]!.background).toBe(receipt.replyId);
      expect(replies[1]!.backgroundRecord).toMatchObject({ id: receipt.recordId, name: 'subagent:research' });
      expect(replies[1]!.output).not.toContain('provider-A');
    });
  });

  it('keeps the started reply absent when completion overtakes the handshake', async () => {
    await withRealLoop(async () => {
      launch();
      await drain();
      answer(0, 'fast answer');
      await drain();
      const replies = humanReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0]!.output).toBe('Subagent research completed.\n\nfast answer');
    });
  });

  it('reports an empty final turn as a valid completion with the blank line', async () => {
    await withRealLoop(async () => {
      launch();
      await drain();
      const run = onlyRun();
      handshake(0, 'provider-A');
      answer(0, '');
      answer(0, '');
      await drain();
      expect(humanReplies().at(-1)!.output).toBe('Subagent research completed.\n\n');
      expect(run.outcome).toBe('completed');
    });
  });

  it('reports a prehandshake failure once with a null session id and no started reply', async () => {
    await withRealLoop(async () => {
      launch();
      await drain();
      const run = onlyRun();
      fail(0, 'Agent: unknown task "task.md".');
      await drain();
      const replies = humanReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0]!.output).toBe('Subagent research failed.\n\nAgent: unknown task "task.md".');
      expect(run.outcome).toBe('failed');
    });
  });

  it('turns a task resolution failure into one failed completion with a null id and no started reply', async () => {
    await withRealLoop(async () => {
      mocks.resolve.mockImplementation(() => { throw new Error('Agent: unknown task "task.md".'); });
      launch();
      await drain();
      const replies = humanReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0]!.output).toBe('Subagent research failed.\n\nAgent: unknown task "task.md".');
      expect(mocks.connectAcp).not.toHaveBeenCalled();
    });
  });

  it('keeps a capped final turn as Partial with no explanatory suffix', async () => {
    await withRealLoop(async () => {
      launch();
      await drain();
      handshake(0, 'provider-A');
      for (let step = 0; step < 8; step += 1) answer(0, 'file read x.md');
      answer(0, 'file read x.md\neight commands done');
      await drain();
      expect(humanReplies().at(-1)!.output).toBe('Subagent research partial.\n\neight commands done');
    });
  });

  it('falls back from a failed first entry to a successful second with one started and the latest id', async () => {
    await withRealLoop(async () => {
      useRole(FALLBACK_ROLE);
      launch();
      await drain();
      const run = onlyRun();
      handshake(0, 'provider-A');
      fail(0, 'first entry failed');
      await vi.waitFor(() => expect(mocks.runToolLoop).toHaveBeenCalledTimes(2));
      await drain();
      handshake(1, 'provider-B');
      answer(1, 'recovered');
      await drain();
      const replies = humanReplies();
      expect(replies.filter((entry) => entry.output === 'Subagent research started.')).toHaveLength(1);
      expect(replies.at(-1)!.output).toBe('Subagent research completed.\n\nrecovered');
      expect(run.outcome).toBe('completed');
    });
  });

  it('terminates a live run through its own record with the exact terminal wording', async () => {
    await withRealLoop(async () => {
      launch();
      await drain();
      handshake(0, 'provider-A');
      const run = onlyRun();
      await controller.managers.agent.finish(run.id, 'terminated');
      await drain();
      expect(humanReplies().at(-1)!.output).toBe('Subagent research terminated.\n\nSubagent terminated.');
    });
  });

  it('keeps concurrent same-role launches distinct in ids, records and replies', async () => {
    await withRealLoop(async () => {
      const first = launch()!;
      const second = launch()!;
      expect(first.recordId).not.toBe(second.recordId);
      expect(first.replyId).not.toBe(second.replyId);
      expect(controller.managers.acpRecords.rows()).toHaveLength(2);
      await drain();
      expect(mocks.runToolLoop).toHaveBeenCalledTimes(2);
      handshake(0, 'provider-A');
      answer(0, 'first result');
      handshake(1, 'provider-B');
      answer(1, 'second result');
      await drain();
      expect(humanReplies()).toHaveLength(4);
      expect(new Set(humanReplies().map((entry) => entry.background)).size).toBe(4);
    });
  });

  it('refuses an unknown role with no run, record or marker', async () => {
    await withRealLoop(async () => {
      const result = runSubagentCommand('subagent --role nosuch --task task.md', caller, controller.managers);
      expect(result).toBeUndefined();
      expect(humanReplies()).toHaveLength(1);
      expect(humanReplies()[0]!.output).toBe('Subagent: unknown role "nosuch".');
      expect(runs()).toHaveLength(0);
      expect(controller.managers.acpRecords.rows()).toHaveLength(0);
    });
  });

  it('returns the exact flag usage for a malformed person form and starts nothing', async () => {
    await withRealLoop(async () => {
      runSubagentCommand('subagent --role research', caller, controller.managers);
      expect(humanReplies()[0]!.output).toBe('Usage: subagent --role <role> [--task <file.md>] [--context <text>]');
      expect(runs()).toHaveLength(0);
    });
  });
});

describe('subagent integration — ACP caller delivery boundary', () => {
  function launchFromAcCaller() {
    return runSubagentCommand(
      'subagent {"role":"research","task":"task.md","context":"What is X?"}',
      caller, controller.managers, acpInvocation(),
    );
  }

  it('returns empty immediate output and delivers exact one-line started then completion JSON', async () => {
    await withRealLoop(async () => {
      const result = launchFromAcCaller();
      expect(result).toBe('');
      await drain();
      handshake(0, 'provider-A');
      answer(0, 'line1\n"quoted" \\ backslash');
      await drain();

      expect(deliveries).toHaveLength(2);
      expect(deliveries[0]).toBe('{"status":"started","role":"research","sessionId":"provider-A","callerId":"provider-caller-1"}');
      expect(deliveries[1]).toBe(String.raw`{"status":"completed","sessionId":"provider-A","callerId":"provider-caller-1","output":"line1\n\"quoted\" \\ backslash"}`);
      expect(deliveries[1]).not.toContain('"role"');
      expect(deliveries[0]).not.toContain('"output"');
      expect(humanReplies().map((entry) => entry.input)).toEqual([
        'tell ← subagent:research started',
        'tell ← subagent:research completed',
      ]);
    });
  });

  it('delivers only a completion with a null session id when no handshake completes', async () => {
    await withRealLoop(async () => {
      launchFromAcCaller();
      await drain();
      fail(0, 'effort failed');
      await drain();
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]).toBe('{"status":"failed","sessionId":null,"callerId":"provider-caller-1","output":"effort failed"}');
    });
  });

  it('delivers the JSON with no role prefix or internal envelope at the prompt boundary', async () => {
    await withRealLoop(async () => {
      launchFromAcCaller();
      await drain();
      handshake(0, 'provider-A');
      answer(0, 'ok');
      await drain();
      expect(deliveries[0]!.startsWith('{')).toBe(true);
      expect(deliveries[0]).not.toContain('runId');
      expect(deliveries[0]).not.toContain('callerIncarnation');
      expect(deliveries[0]).not.toContain('callerSessionIdentity');
      expect(deliveries.some((entry) => entry.startsWith('tell '))).toBe(false);
    });
  });
});
