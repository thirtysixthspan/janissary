import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Attempt from './attempt.js';
import type * as DriveLoop from '../acp/drive-loop.js';
import type { AgentRecordFeed } from '../agent/record-feed.js';
import type { AcpLoopHandlers, AcpSession } from '../acp/types.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type { Managers } from '../managers.js';
import type { AcpRoleSettings } from '../acp/ask-role.js';
import { exhaustedError, fallbackNotice } from '../acp/ask-role.js';
import type { CommandSettingsSnapshot } from '../native-commands/settings-types.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import { AgentRun } from '../agent/run.js';
import { errorText } from '../error-text.js';
import type { SubagentExecutionOptions } from './execute.js';

const mocks = vi.hoisted(() => ({
  runSubagentEntry: vi.fn(),
  real: undefined as unknown,
  connectAcp: vi.fn(),
  runToolLoop: vi.fn(),
  createRemoteAcpSession: vi.fn(),
}));

vi.mock('./attempt.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Attempt>();
  mocks.real = actual.runSubagentEntry;
  return { ...actual, runSubagentEntry: (options: Attempt.SubagentAttemptOptions) => mocks.runSubagentEntry(options) };
});
vi.mock('../acp/index.js', () => ({ connectAcp: mocks.connectAcp }));
vi.mock('../acp/drive-loop.js', async (importOriginal) => {
  const actual = await importOriginal<typeof DriveLoop>();
  return { ...actual, runToolLoop: mocks.runToolLoop };
});
vi.mock('../remote/acp-session.js', () => ({ createRemoteAcpSession: mocks.createRemoteAcpSession }));

const { executeSubagentRun } = await import('./execute.js');

type AttemptResult = Attempt.SubagentAttemptResult;
type AttemptOptions = Attempt.SubagentAttemptOptions;

const OPENCODE: RoleEntry = { harness: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', effort: 'medium' };
const CLAUDE: RoleEntry = { harness: 'claude', model: 'claude-haiku-4-5', effort: 'high' };
const CODEX: RoleEntry = { harness: 'codex', model: 'gpt-6-luna' };
const ENTRIES = [OPENCODE, CLAUDE, CODEX] as const;
const TASK = 'TASK\nverbatim ';
const CONTEXT = 'EXTRA\ncontext ';
const runs: AgentRun[] = [];

function nativeSettings(): CommandSettingsSnapshot {
  return {
    commands: [{ name: 'file read', effectiveEnabled: true, effectiveAgentAccess: true }],
    source: 'default', path: '',
  } as CommandSettingsSnapshot;
}

function baseResult(overrides: Partial<AttemptResult> = {}): AttemptResult {
  return {
    status: 'failed', response: 'boom', replied: false, reason: 'error', sessionId: null,
    cleanupWarnings: [], ...overrides,
  };
}

function failed(response = 'boom', warnings: string[] = []): AttemptResult {
  return baseResult({ response, cleanupWarnings: warnings });
}

function answered(response: string, warnings: string[] = []): AttemptResult {
  return baseResult({ status: 'completed', response, replied: true, reason: 'answered', cleanupWarnings: warnings });
}

function partial(response: string): AttemptResult {
  return baseResult({ status: 'partial', response, replied: true, reason: 'capped' });
}

function handshake(id: string, result: AttemptResult) {
  return (options: AttemptOptions) => {
    options.onSessionStarted?.(id);
    return Promise.resolve(result);
  };
}

type Script = AttemptResult | ((options: AttemptOptions) => Promise<AttemptResult> | AttemptResult);

function script(...steps: Script[]): void {
  mocks.runSubagentEntry.mockReset();
  const queue = [...steps];
  mocks.runSubagentEntry.mockImplementation((options: AttemptOptions) => {
    const next = queue.shift();
    if (next === undefined) throw new Error('unexpected extra attempt');
    if (typeof next === 'function') return next(options);
    return Promise.resolve(next);
  });
}

function useRealDriver(): void {
  mocks.runSubagentEntry.mockReset();
  mocks.runSubagentEntry.mockImplementation((options: AttemptOptions) => (mocks.real as typeof Attempt.runSubagentEntry)(options));
}

type ConnectOptions = {
  onError: (message: string) => void;
  onSessionStarted?: (id: string) => void;
};

function fakeSession(onConnect?: (options: ConnectOptions) => void): AcpSession {
  const session: AcpSession = {
    prompt: vi.fn(), cancel: vi.fn(async () => {}), kill: vi.fn(), shutdown: vi.fn(async () => {}),
  };
  mocks.connectAcp.mockImplementation((options: ConnectOptions) => {
    onConnect?.(options);
    return session;
  });
  return session;
}

function connectOptions(call = 0): ConnectOptions {
  return mocks.connectAcp.mock.calls[call][0] as ConnectOptions;
}

function loopEvents(call = 0): AcpLoopHandlers {
  return mocks.runToolLoop.mock.calls[call][4] as AcpLoopHandlers;
}

function answer(call: number, text: string): void {
  const events = loopEvents(call);
  events.endTurn(text);
  events.finished('answered', 8);
}

function setup(overrides: Partial<SubagentExecutionOptions> = {}, absentNative = false) {
  const caller = { label: 'caller', incarnation: 'inc', cwd: '/caller', context: ['caller-ctx'] };
  const run = new AgentRun(caller, {
    taskPath: 'task.md', taskText: TASK, skills: [], grants: ['file read'],
  }, undefined, undefined, '/clone');
  runs.push(run);
  const record = { prompt: vi.fn(), activity: vi.fn(), finish: vi.fn() };
  run.record = record as unknown as AgentRecordFeed;
  const invocation: CommandInvocationContext = {
    runId: 'launch-run', invocationId: 'launch-inv', caller, signal: run.abortController.signal,
    line: 'subagent --role Research --task task.md', acpTool: true, acpRole: 'ask',
  };
  const current = vi.fn(() => nativeSettings());
  const command = { dispatchNativeLine: vi.fn(async () => ({ dispatched: true, output: '' })) };
  const managers = {
    ...(!absentNative && { nativeCommandSettings: { current } }),
    command,
  } as unknown as Managers;
  const settings: AcpRoleSettings = {
    name: 'Research',
    entries: ENTRIES.map((entry) => ({ ...entry })),
    commands: ['file read', 'subagent', 'db sqlite query'],
  };
  const options: SubagentExecutionOptions = {
    run, invocation, managers, settings, entries: ENTRIES, executionDir: '/clone',
    offline: true, context: CONTEXT, ...overrides,
  };
  return { run, record, invocation, managers, current, command, settings, options };
}

beforeEach(() => {
  mocks.connectAcp.mockReset();
  mocks.runToolLoop.mockReset();
  mocks.runToolLoop.mockImplementation(() => {});
  mocks.createRemoteAcpSession.mockReset();
  runs.length = 0;
  useRealDriver();
});

afterEach(async () => {
  for (const run of runs) if (run.outcome === undefined) await run.finish('completed');
});

describe('executeSubagentRun', () => {
  it('forwards one stored opencode/claude/codex sequence with stored and omitted effort and no current promotion', async () => {
    const { options } = setup();
    script(failed('one'), failed('two'), answered('final'));
    const result = await executeSubagentRun(options);
    expect(result).toMatchObject({ status: 'completed', response: 'final' });
    expect(mocks.runSubagentEntry.mock.calls.map((call) => call[0].entry)).toEqual([OPENCODE, CLAUDE, CODEX]);
    expect(mocks.runSubagentEntry.mock.calls[0][0].entry).not.toHaveProperty('current');
  });

  it('retains duplicate entries in order', async () => {
    const duplicate = { ...OPENCODE };
    const { options } = setup({ entries: [OPENCODE, duplicate, CLAUDE] });
    script(failed('one'), answered('second'));
    await executeSubagentRun(options);
    expect(mocks.runSubagentEntry.mock.calls.map((call) => call[0].entry)).toEqual([OPENCODE, duplicate]);
  });

  it('keeps captured role, entry and command copies when the inputs mutate mid-flight', async () => {
    const entries = [{ ...OPENCODE }, { ...CLAUDE }];
    const { options, settings } = setup({ entries: [entries[0]!, entries[1]!] });
    const gate = Promise.withResolvers<AttemptResult>();
    script((() => gate.promise), answered('ok'));
    const execution = executeSubagentRun(options);
    entries[0]!.model = 'mutated';
    entries[1]!.harness = 'mutated';
    settings.name = 'Mutated';
    settings.entries[0]!.model = 'mutated';
    settings.commands.push('mutated');
    gate.resolve(failed('boom'));
    expect(await execution).toMatchObject({ status: 'completed', response: 'ok' });
    const calls = mocks.runSubagentEntry.mock.calls;
    expect(calls[0][0].entry).toEqual(OPENCODE);
    expect(calls[1][0].entry).toEqual(CLAUDE);
    expect(calls[1][0].settings).toMatchObject({
      name: 'Research', entries: [OPENCODE, CLAUDE, CODEX].map((entry) => ({ ...entry })),
      commands: ['file read', 'subagent', 'db sqlite query'],
    });
  });

  it('reads current() once and reuses the same snapshot after a settings edit', async () => {
    const { options, current } = setup();
    const gate = Promise.withResolvers<AttemptResult>();
    script((() => gate.promise), answered('ok'));
    const execution = executeSubagentRun(options);
    const captured = current.mock.results[0].value;
    current.mockImplementation(() => nativeSettings());
    gate.resolve(failed('boom'));
    await execution;
    expect(current).toHaveBeenCalledOnce();
    expect(mocks.runSubagentEntry.mock.calls[0][0].nativeSettings).toBe(captured);
    expect(mocks.runSubagentEntry.mock.calls[1][0].nativeSettings).toBe(captured);
  });

  it('keeps absent native settings undefined through fallback', async () => {
    const { options } = setup({}, true);
    script(failed('one'), answered('ok'));
    expect(await executeSubagentRun(options)).toMatchObject({ status: 'completed', response: 'ok' });
    expect(mocks.runSubagentEntry.mock.calls.every((call) => call[0].nativeSettings === undefined)).toBe(true);
  });

  it('forwards captured invocation, context, directory, offline and remote unchanged', async () => {
    const remote = { channel: {} as RemoteChannel, host: 'build-box', workspace: 'clone-9' };
    const local = setup();
    script(answered('local'));
    await executeSubagentRun(local.options);
    const localCall = mocks.runSubagentEntry.mock.calls[0][0];
    expect(localCall.invocation).toBe(local.invocation);
    expect(localCall.context).toBe(CONTEXT);
    expect(localCall.executionDir).toBe('/clone');
    expect(localCall.offline).toBe(true);
    expect(localCall.remote).toBeUndefined();

    const far = setup({ remote });
    script(answered('remote'));
    await executeSubagentRun(far.options);
    expect(mocks.runSubagentEntry.mock.calls[0][0].remote).toBe(remote);
  });

  it('falls back through a real driver when no harness adapter exists', async () => {
    const { options } = setup({ entries: [{ harness: 'unsupported', model: 'm' }, CLAUDE] });
    useRealDriver();
    fakeSession();
    const execution = executeSubagentRun(options);
    await vi.waitFor(() => expect(mocks.runToolLoop).toHaveBeenCalledTimes(1));
    answer(0, 'adapter fallback');
    expect(await execution).toMatchObject({ status: 'completed', response: 'adapter fallback' });
    expect(mocks.connectAcp).toHaveBeenCalledTimes(1);
  });

  it('falls back through a real driver on a synchronous spawn failure', async () => {
    const { options } = setup();
    useRealDriver();
    const session = fakeSession();
    mocks.connectAcp.mockImplementationOnce(() => { throw new Error('spawn boom'); });
    mocks.connectAcp.mockImplementationOnce(() => session);
    const execution = executeSubagentRun(options);
    await vi.waitFor(() => expect(mocks.runToolLoop).toHaveBeenCalledTimes(1));
    answer(0, 'after spawn');
    const result = await execution;
    expect(result).toMatchObject({ status: 'completed', response: 'after spawn' });
    expect(result.cleanupWarnings).toEqual([]);
  });

  it('falls back through a real driver on a connection onError', async () => {
    const { options } = setup();
    useRealDriver();
    fakeSession();
    const execution = executeSubagentRun(options);
    await vi.waitFor(() => expect(mocks.runToolLoop).toHaveBeenCalledTimes(1));
    connectOptions(0).onError('connection boom');
    await vi.waitFor(() => expect(mocks.runToolLoop).toHaveBeenCalledTimes(2));
    answer(1, 'after connection');
    expect(await execution).toMatchObject({ status: 'completed', response: 'after connection' });
  });

  it('falls back through a real driver on a loop error before endTurn', async () => {
    const { options } = setup();
    useRealDriver();
    fakeSession();
    const execution = executeSubagentRun(options);
    await vi.waitFor(() => expect(mocks.runToolLoop).toHaveBeenCalledTimes(1));
    loopEvents(0).error('loop boom');
    await vi.waitFor(() => expect(mocks.runToolLoop).toHaveBeenCalledTimes(2));
    answer(1, 'after loop error');
    expect(await execution).toMatchObject({ status: 'completed', response: 'after loop error' });
  });

  it.each(['nonempty', '', ' '.repeat(3)])('forbids fallback after endTurn %j then an error', async (display) => {
    const { options } = setup();
    useRealDriver();
    fakeSession();
    const execution = executeSubagentRun(options);
    await vi.waitFor(() => expect(mocks.runToolLoop).toHaveBeenCalledTimes(1));
    const events = loopEvents(0);
    events.endTurn(display);
    events.error('after turn');
    expect(await execution).toMatchObject({ status: 'failed', response: 'after turn' });
    expect(mocks.runSubagentEntry).toHaveBeenCalledTimes(1);
  });

  it('forbids fallback after a command-only endTurn through the real driver', async () => {
    const { options } = setup();
    useRealDriver();
    fakeSession();
    const execution = executeSubagentRun(options);
    await vi.waitFor(() => expect(mocks.runToolLoop).toHaveBeenCalledTimes(1));
    const events = loopEvents(0);
    events.endTurn('file read notes.md');
    events.error('after command');
    expect(await execution).toMatchObject({ status: 'failed', response: 'after command' });
    expect(mocks.runSubagentEntry).toHaveBeenCalledTimes(1);
  });

  it('keeps only the post-turn error after an earlier eligible failure', async () => {
    const { options } = setup();
    script(failed('eligible'), baseResult({ status: 'failed', response: 'post turn\nerror', replied: true }));
    const result = await executeSubagentRun(options);
    expect(result.response).toBe('post turn\nerror');
    expect(result.response).not.toContain('every model');
  });

  it('keeps exact source text for a single eligible failure', async () => {
    const { options } = setup({ entries: [OPENCODE] });
    const source = 'first line\n  indented second line';
    script(failed(source));
    expect(await executeSubagentRun(options)).toMatchObject({ status: 'failed', response: source });
  });

  it('exhausts with canonical role spelling, entry order and multiline errors', async () => {
    const { options } = setup();
    const errors = ['one\nline', 'two\n  line', 'three'];
    script(failed(errors[0]!), failed(errors[1]!), failed(errors[2]!));
    const result = await executeSubagentRun(options);
    expect(result.status).toBe('failed');
    expect(result.response).toBe(exhaustedError([
      { entry: OPENCODE, error: errors[0]! },
      { entry: CLAUDE, error: errors[1]! },
      { entry: CODEX, error: errors[2]! },
    ], 'Research'));
  });

  it('reports fallback notices in activity only, not on terminal failure or success', async () => {
    const { options, record, run } = setup();
    script(failed('one'), failed('two'), answered('final'));
    await executeSubagentRun(options);
    expect(record.activity.mock.calls).toEqual([
      ['message', fallbackNotice(OPENCODE, CLAUDE)],
      ['message', fallbackNotice(CLAUDE, CODEX)],
    ]);
    expect(run.view().activity.map((item) => item.text)).toEqual(record.activity.mock.calls.map((call) => call[1]));

    const terminal = setup({ entries: [OPENCODE] });
    script(failed('one'));
    await executeSubagentRun(terminal.options);
    expect(terminal.record.activity).not.toHaveBeenCalled();

    const success = setup();
    script(answered('done'));
    await executeSubagentRun(success.options);
    expect(success.record.activity).not.toHaveBeenCalled();
  });

  it.each(['nonempty answer', '', ' '.repeat(3)])('preserves a completed response of %j verbatim', async (display) => {
    const { options } = setup();
    script(answered(display));
    expect(await executeSubagentRun(options)).toMatchObject({ status: 'completed', response: display });
  });

  it.each(['partial answer', '', ' '.repeat(3)])('preserves a partial response of %j with no suffix', async (display) => {
    const { options } = setup();
    script(partial(display));
    const result = await executeSubagentRun(options);
    expect(result).toMatchObject({ status: 'partial', response: display });
    expect(result.response).not.toContain('stopped after');
  });

  it('leaves sessionId null and never calls the observer without a handshake', async () => {
    const { options } = setup();
    const onStarted = vi.fn();
    script(answered('done'));
    const result = await executeSubagentRun({ ...options, onStarted });
    expect(result.sessionId).toBeNull();
    expect(onStarted).not.toHaveBeenCalled();
  });

  it('reports started(A) once and returns the latest fallback id B', async () => {
    const { options } = setup();
    const onStarted = vi.fn();
    script(handshake('A', failed('boom')), handshake('B', answered('done')));
    const result = await executeSubagentRun({ ...options, onStarted });
    expect(onStarted.mock.calls).toEqual([['A']]);
    expect(result.sessionId).toBe('B');
  });

  it('retains id A when a later attempt fails before its handshake', async () => {
    const { options } = setup({ entries: [OPENCODE, CLAUDE] });
    script(handshake('A', failed('boom')), failed('later'));
    const result = await executeSubagentRun(options);
    expect(result.sessionId).toBe('A');
    expect(result.status).toBe('failed');
  });

  it('retains a synchronous handshake id when the observer throws and falls back', async () => {
    const { options } = setup();
    const onStarted = vi.fn(() => { throw new Error('observer boom'); });
    script((driver) => {
      try { driver.onSessionStarted?.('A'); }
      catch (error) { return Promise.resolve(failed(errorText(error))); }
      return Promise.resolve(failed('unexpected'));
    }, handshake('B', answered('done')));
    const result = await executeSubagentRun({ ...options, onStarted });
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'completed', response: 'done', sessionId: 'B' });
  });

  it('ignores obsolete entry callbacks after a replacement is admitted', async () => {
    const { options } = setup();
    let stale: ((id: string) => void) | undefined;
    const onStarted = vi.fn();
    script((driver) => {
      stale = driver.onSessionStarted;
      return Promise.resolve(failed('boom'));
    }, (driver) => {
      stale?.('obsolete');
      driver.onSessionStarted?.('B');
      return Promise.resolve(answered('done'));
    });
    const result = await executeSubagentRun({ ...options, onStarted });
    expect(result.sessionId).toBe('B');
    expect(onStarted.mock.calls).toEqual([['B']]);
  });

  it('aggregates identical warnings from two leases without changing the chosen outcome', async () => {
    const { options } = setup();
    script(failed('boom', ['same']), answered('done', ['same', 'second']));
    const result = await executeSubagentRun(options);
    expect(result).toMatchObject({ status: 'completed', response: 'done' });
    expect(result.cleanupWarnings).toEqual(['same', 'same', 'second']);
  });

  it('returns without settling the run, closing the record or releasing the one ACP resource', async () => {
    const { options, run, record } = setup();
    script(answered('done'));
    expect(await executeSubagentRun(options)).toMatchObject({ status: 'completed', response: 'done' });
    expect(run.outcome).toBeUndefined();
    expect(run.currentStatus).toBe('Running');
    expect(record.finish).not.toHaveBeenCalled();
    expect([...run.childIds]).toEqual([`acp:${run.id}`]);
  });
});
