import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DriveLoop from '../acp/drive-loop.js';
import type { AcpPromptHandlers, AcpSession, AcpLoopHandlers, AcpRunSnapshot } from '../acp/types.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import type { AcpRoleSettings } from '../acp/ask-role.js';
import type { CommandSettingsSnapshot } from '../native-commands/settings-types.js';
import type { Managers } from '../managers.js';
import { AgentRun } from '../agent/run.js';
import type { AgentRecordFeed } from '../agent/record-feed.js';
import { corePrimer } from '../acp/drive-loop.js';
import { createAcpToolTable } from '../acp/tool-table.js';
import { coreSnapshotRows } from '../acp/run-prompt.js';
import { subagentTaskPrompt } from './primer.js';
import type { SubagentAttemptOptions } from './attempt.js';

const mocks = vi.hoisted(() => ({ connectAcp: vi.fn(), runToolLoop: vi.fn(), runWorkspaceCommandIn: vi.fn() }));
vi.mock('../acp/index.js', () => ({ connectAcp: mocks.connectAcp }));
vi.mock('../acp/drive-loop.js', async (importOriginal) => {
  const actual = await importOriginal<typeof DriveLoop>();
  return { ...actual, runToolLoop: mocks.runToolLoop };
});
vi.mock('../acp/workspace-runner.js', () => ({ runWorkspaceCommandIn: mocks.runWorkspaceCommandIn }));

const { runSubagentEntry } = await import('./attempt.js');

const ENTRY: RoleEntry = { harness: 'opencode', model: 'model-a' };
const SETTINGS: AcpRoleSettings = {
  name: 'Research', entries: [ENTRY], commands: ['file read', 'file write', 'subagent', 'db sqlite query'],
};
const TASK = 'TASK\nverbatim ';
const CONTEXT = 'EXTRA\ncontext ';
const runs: AgentRun[] = [];
const block = (command: string): string => '```janissary\n' + command + '\n```';

function nativeSettings(): CommandSettingsSnapshot {
  return {
    commands: [
      { name: 'file read', effectiveEnabled: true, effectiveAgentAccess: true },
      { name: 'db sqlite query', effectiveEnabled: false, effectiveAgentAccess: true },
    ],
    source: 'default', path: '',
  } as CommandSettingsSnapshot;
}

function setup(overrides: Partial<SubagentAttemptOptions> = {}) {
  const caller = { label: 'caller', incarnation: 'inc', cwd: '/caller', context: ['caller-ctx'] };
  const run = new AgentRun(caller, {
    taskPath: 'task.md', taskText: TASK, skills: [], grants: ['file read', 'subagent'],
  }, undefined, undefined, '/clone');
  runs.push(run);
  const record = { prompt: vi.fn(), activity: vi.fn(), finish: vi.fn() };
  run.record = record as unknown as AgentRecordFeed;
  const invocation: CommandInvocationContext = {
    runId: 'launch-run', invocationId: 'launch-inv', caller, signal: run.abortController.signal,
  };
  const managers = {
    command: { dispatchNativeLine: vi.fn(async () => ({ dispatched: true, output: '' })) },
  } as unknown as Managers;
  const settings = nativeSettings();
  const options: SubagentAttemptOptions = {
    run, invocation, managers, settings: SETTINGS, entry: ENTRY, executionDir: '/clone',
    offline: true, nativeSettings: settings, context: CONTEXT, ...overrides,
  };
  return { run, record, invocation, managers, settings, options };
}

type ConnectOptions = { onSessionStarted?: (id: string) => void; onError: (message: string) => void };

function fakeSession(onConnect?: (options: ConnectOptions) => void) {
  const prompts: { text: string; handlers: AcpPromptHandlers }[] = [];
  const shutdown = vi.fn(async () => {});
  const session: AcpSession = {
    prompt: (text, handlers) => { prompts.push({ text, handlers }); },
    cancel: vi.fn(async () => {}), kill: vi.fn(), shutdown,
  };
  mocks.connectAcp.mockImplementation((options: ConnectOptions) => {
    onConnect?.(options);
    return session;
  });
  return { session, prompts, shutdown };
}

function scriptedSession(turns: string[][]) {
  const prompts: string[] = [];
  let index = 0;
  const session: AcpSession = {
    prompt(text, handlers) {
      prompts.push(text);
      const deltas = turns[Math.min(index, turns.length - 1)] ?? [];
      index += 1;
      for (const delta of deltas) handlers.onChunk(delta);
      handlers.onEnd('end_turn');
    },
    cancel: vi.fn(async () => {}), kill: vi.fn(), shutdown: vi.fn(async () => {}),
  };
  mocks.connectAcp.mockReturnValue(session);
  return { session, prompts };
}

function start(options: SubagentAttemptOptions) {
  const execution = runSubagentEntry(options);
  const call = mocks.runToolLoop.mock.calls.at(-1)!;
  return {
    execution,
    loopSession: call[0] as { prompt: (text: string, handlers: AcpPromptHandlers) => void },
    prompt: call[1] as string,
    snapshot: call[2] as Extract<AcpRunSnapshot, { kind: 'core' }>,
    host: call[3],
    events: call[4] as AcpLoopHandlers,
  };
}

async function withRealLoop(fn: () => Promise<void>): Promise<void> {
  const actual = await vi.importActual<typeof DriveLoop>('../acp/drive-loop.js');
  await mocks.runToolLoop.withImplementation(actual.runToolLoop, fn);
}

function answer(events: AcpLoopHandlers, text: string, reason: 'answered' | 'capped' = 'answered') {
  events.endTurn(text);
  events.finished(reason, 8);
}

function connectOptions(call = 0): ConnectOptions {
  return mocks.connectAcp.mock.calls[call][0] as ConnectOptions;
}

beforeEach(() => {
  mocks.connectAcp.mockReset();
  mocks.runToolLoop.mockReset();
  mocks.runWorkspaceCommandIn.mockReset();
  runs.length = 0;
});
afterEach(async () => {
  for (const run of runs) if (run.outcome === undefined) await run.finish('completed');
});

describe('runSubagentEntry', () => {
  it('records the full provider preamble once and keeps the raw prompt unchanged', async () => {
    const { options, record, settings } = setup();
    const { prompts } = scriptedSession([['final']]);
    await withRealLoop(async () => {
      const result = await runSubagentEntry(options);
      expect(result.status).toBe('completed');
      const expected = {
        kind: 'core', role: 'ask', roleName: 'Research',
        grants: ['file read', 'file write', 'db sqlite query'],
        rows: coreSnapshotRows(settings), withoutTools: false,
      } as Extract<AcpRunSnapshot, { kind: 'core' }>;
      const primer = corePrimer(expected, createAcpToolTable(expected.grants));
      const taskPrompt = subagentTaskPrompt(TASK, CONTEXT);
      const fullPrompt = `${primer}\n\n${taskPrompt}`;
      expect(record.prompt.mock.calls).toEqual([[taskPrompt, primer]]);
      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toBe(fullPrompt);
      expect(prompts[0].split(primer)).toHaveLength(2);
      expect(prompts[0].split(taskPrompt)).toHaveLength(2);
    });
  });

  it('records the preamble before a task-only prompt when no context is given', async () => {
    const { options, record, settings } = setup({ context: undefined });
    scriptedSession([['final']]);
    await withRealLoop(async () => {
      await runSubagentEntry(options);
      const expected = {
        kind: 'core', role: 'ask', roleName: 'Research',
        grants: ['file read', 'file write', 'db sqlite query'],
        rows: coreSnapshotRows(settings), withoutTools: false,
      } as Extract<AcpRunSnapshot, { kind: 'core' }>;
      const primer = corePrimer(expected, createAcpToolTable(expected.grants));
      expect(record.prompt.mock.calls).toEqual([[subagentTaskPrompt(TASK), primer]]);
    });
  });

  it('builds an ask core snapshot with canonical role name and grants without subagent', async () => {
    const { options, settings } = setup();
    fakeSession();
    const { snapshot, prompt, events, execution } = start(options);
    expect(snapshot).toEqual({
      kind: 'core', role: 'ask', roleName: 'Research',
      grants: ['file read', 'file write', 'db sqlite query'],
      rows: coreSnapshotRows(settings), withoutTools: false,
    });
    expect(prompt).toBe(subagentTaskPrompt(TASK, CONTEXT));
    expect(snapshot.grants).not.toContain('subagent');
    expect(corePrimer(snapshot, createAcpToolTable(snapshot.grants))).not.toContain('subagent');
    expect(createAcpToolTable(snapshot.grants).some((tool) => tool.name === 'subagent')).toBe(false);
    answer(events, 'done');
    await execution;
  });

  it('uses captured effective native rows despite later settings changes', async () => {
    const { options, settings } = setup();
    fakeSession();
    const { events, execution } = start(options);
    const captured = coreSnapshotRows(settings);
    settings.commands[0].effectiveEnabled = false;
    expect(mocks.runToolLoop.mock.calls[0][2].rows).toEqual(captured);
    answer(events, 'done');
    await execution;
  });

  it('returns a verbatim nonempty completion', async () => {
    const { options } = setup();
    fakeSession();
    const { execution, events } = start(options);
    answer(events, '  Final  answer\n');
    expect(await execution).toMatchObject({
      status: 'completed', response: '  Final  answer\n', replied: true, reason: 'answered', sessionId: null,
    });
  });

  it('extracts the delimited final result from a completed turn', async () => {
    const { options } = setup();
    fakeSession();
    const { execution, events } = start(options);
    answer(events, 'thinking\n<final_result>\nThe answer.\n</final_result>\ntrailing');
    expect(await execution).toMatchObject({
      status: 'completed', response: 'The answer.', replied: true, reason: 'answered',
    });
  });

  it('keeps a verbatim completion when the turn has no delimiters', async () => {
    const { options } = setup();
    fakeSession();
    const { execution, events } = start(options);
    answer(events, 'plain answer');
    expect(await execution).toMatchObject({
      status: 'completed', response: 'plain answer', replied: true, reason: 'answered',
    });
  });

  it('treats an empty final answer through the real cold-start retry as completed', async () => {
    const { options } = setup();
    const { prompts } = scriptedSession([[], []]);
    await withRealLoop(async () => {
      const result = await runSubagentEntry(options);
      expect(prompts).toHaveLength(2);
      expect(result).toMatchObject({ status: 'completed', response: '', replied: true, reason: 'answered' });
    });
  });

  it('maps a capped eight-command run to partial with no added suffix', async () => {
    const { options } = setup();
    fakeSession();
    const { execution, events } = start(options);
    for (let step = 0; step < 8; step += 1) events.ranCommand('file read x.md', `output ${step}`, true);
    answer(events, 'last reply', 'capped');
    const result = await execution;
    expect(result).toMatchObject({ status: 'partial', response: 'last reply', replied: true, reason: 'capped' });
    expect(result.response).not.toContain('stopped after');
  });

  it('never lets chunks or tool results become the response', () => {
    const { options, record } = setup();
    fakeSession();
    const { events } = start(options);
    events.chunk('streamed thought');
    events.startCommand?.('file read x.md', true);
    events.ranCommand('file read x.md', 'tool output', true);
    answer(events, 'final');
    expect(record.activity.mock.calls).toEqual([
      ['tool', 'file read x.md', 'command'],
      ['tool', 'tool output', 'reply', 'file read x.md'],
    ]);
    expect(mocks.runToolLoop).toHaveBeenCalledTimes(1);
  });

  it('records a command in the feed when it starts, before a long-running command resolves', async () => {
    const { options, record } = setup();
    const gate = Promise.withResolvers<string>();
    mocks.runWorkspaceCommandIn.mockReturnValue(gate.promise);
    scriptedSession([[block('file read a.md')], ['done']]);
    await withRealLoop(async () => {
      const execution = runSubagentEntry(options);
      await vi.waitFor(() => expect(record.activity.mock.calls).toEqual([['tool', 'file read a.md', 'command']]));
      expect(mocks.runWorkspaceCommandIn).toHaveBeenCalledWith('/clone', 'file read a.md', expect.any(AbortSignal));
      gate.resolve('1\tone');
      expect(await execution).toMatchObject({ status: 'completed', response: 'done', reason: 'answered' });
      expect(record.activity.mock.calls).toEqual([
        ['tool', 'file read a.md', 'command'],
        ['tool', '1\tone', 'reply', 'file read a.md'],
      ]);
    });
  });

  it('still records the command text when the command throws before returning a result', async () => {
    const { options, record } = setup();
    mocks.runWorkspaceCommandIn.mockRejectedValue(new Error('command boom'));
    scriptedSession([[block('file read a.md')]]);
    await withRealLoop(async () => {
      const result = await runSubagentEntry(options);
      expect(result).toMatchObject({ status: 'partial', reason: 'capped' });
      expect(record.activity.mock.calls[0]).toEqual(['tool', 'file read a.md', 'command']);
      expect(record.activity.mock.calls.some(([kind, text]) =>
        kind === 'tool' && String(text).includes('ACP error: command boom'))).toBe(true);
    });
  });

  it('reports a connection failure before any endTurn as failed/error', () => {
    const { options } = setup();
    fakeSession();
    const { execution, events } = start(options);
    connectOptions().onError('connection boom');
    answer(events, 'late answer');
    return expect(execution).resolves.toMatchObject({
      status: 'failed', response: 'connection boom', replied: false, reason: 'error',
    });
  });

  it('reports a loop error before any endTurn as failed/error', () => {
    const { options } = setup();
    fakeSession();
    const { execution, events } = start(options);
    events.error('loop boom');
    answer(events, 'late answer');
    return expect(execution).resolves.toMatchObject({
      status: 'failed', response: 'loop boom', replied: false, reason: 'error',
    });
  });

  it.each(['', 'file read x.md'])('keeps replied true when failure follows endTurn %j', (text) => {
    const { options } = setup();
    fakeSession();
    const { execution, events } = start(options);
    events.endTurn(text);
    events.error('after end');
    return expect(execution).resolves.toMatchObject({
      status: 'failed', response: 'after end', replied: true, reason: 'error',
    });
  });

  it('keeps the source text of a synchronous driver failure', () => {
    const { options } = setup();
    fakeSession();
    mocks.runToolLoop.mockImplementationOnce(() => { throw new Error('driver boom'); });
    return expect(runSubagentEntry(options)).resolves.toMatchObject({
      status: 'failed', response: 'driver boom', replied: false, reason: 'error',
    });
  });

  it('keeps the source text of a synchronous observer failure and retains the provider id', () => {
    const { options } = setup();
    fakeSession((connect) => connect.onSessionStarted?.('provider-9'));
    const observer = vi.fn(() => { throw new Error('observer boom'); });
    const { execution } = start({ ...options, onSessionStarted: observer });
    return expect(execution).resolves.toMatchObject({
      status: 'failed', response: 'observer boom', sessionId: 'provider-9', replied: false,
    });
  });

  it('retains one result while all late callbacks stay inert', async () => {
    const { options } = setup();
    const onSessionStarted = vi.fn();
    fakeSession((connect) => connect.onSessionStarted?.('provider-1'));
    const { execution, events } = start({ ...options, onSessionStarted });
    events.endTurn('winner');
    events.finished('answered', 8);
    events.chunk('late chunk');
    events.error('late error');
    events.endTurn('late answer');
    events.finished('capped', 8);
    connectOptions().onError('late connection');
    connectOptions().onSessionStarted('provider-2');
    expect(await execution).toMatchObject({
      status: 'completed', response: 'winner', replied: true, reason: 'answered', sessionId: 'provider-1',
    });
    expect(onSessionStarted).toHaveBeenCalledTimes(1);
  });

  it('reports an unsupported harness with the exact adapter message and opens no session', async () => {
    const { options } = setup({ entry: { harness: 'unsupported', model: 'm' } });
    expect(await runSubagentEntry(options)).toMatchObject({
      status: 'failed', response: 'no ACP adapter for harness "unsupported".', reason: 'error', sessionId: null,
    });
    expect(mocks.connectAcp).not.toHaveBeenCalled();
  });
});
