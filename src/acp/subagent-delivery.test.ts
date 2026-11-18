import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcpLoopHandlers, AcpSession } from './types.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';
import type { AcpRoleSettings } from './ask-role.js';
import type { AcpRole } from './role.js';
import type { AgentAcpCaller } from '../agent/run.js';
import { makeTab } from '../tab/index.js';
import { tabRuntime } from '../tab/runtime.js';
import {
  serializeSubagentMessage, type SubagentDelivery, type SubagentMessage,
} from '../subagent/messages.js';

const mocks = vi.hoisted(() => ({ connectAcp: vi.fn(), runAcpToolLoop: vi.fn() }));
vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));
vi.mock('./index.js', () => ({ connectAcp: mocks.connectAcp }));
vi.mock('./loop.js', () => ({ runAcpToolLoop: mocks.runAcpToolLoop }));
vi.mock('../bus.js', () => ({ messageBus: { emit: vi.fn() } }));

import { AcpManager } from './manager.js';

const OPENCODE: RoleEntry = { harness: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', effort: 'medium' };
const CLAUDE: RoleEntry = { harness: 'claude', model: 'claude-haiku-4-5', effort: 'high' };
const ECHO = 'ask ← subagent:research started';
const sessions: AcpSession[] = [];

type Run = {
  id: string;
  outcome?: string;
  acpCaller?: AgentAcpCaller;
  caller: { label: string; incarnation: string };
};

function started(runId: string): SubagentMessage {
  return { status: 'started', role: 'research', sessionId: `p-${runId}`, callerId: 'caller' };
}

function completed(runId: string): SubagentMessage {
  return { status: 'completed', sessionId: `p-${runId}`, callerId: 'caller', output: `result ${runId}` };
}

function setup(options: {
  entries?: RoleEntry[];
  extraTabs?: string[];
  roleSettings?: (root: string, role: AcpRole) => AcpRoleSettings;
} = {}) {
  const entries = options.entries ?? [OPENCODE, CLAUDE];
  const events: string[] = [];
  mocks.connectAcp.mockImplementation(() => {
    const session: AcpSession = {
      prompt: vi.fn(), kill: vi.fn(), cancel: vi.fn(async () => {}), shutdown: vi.fn(async () => {}),
    };
    sessions.push(session);
    return session;
  });
  mocks.runAcpToolLoop.mockImplementation((_session: unknown, prompt: string) => {
    events.push(`prompt:${prompt}`);
  });
  const tabs = [makeTab('tab1', '#fff'), ...(options.extraTabs ?? []).map((label) => makeTab(label, '#000'))];
  const append = vi.fn((_label: string, entry: { background?: string; input?: string }) => {
    if (entry.background) events.push(`reply:${entry.input}`);
  });
  const enabledModels = new Set(entries.map(({ harness, model }) => `${harness} ${model}`));
  const acpRecords = {
    begin: vi.fn(() => 'record-id'), prompt: vi.fn(() => true),
    activity: vi.fn(), answer: vi.fn(), close: vi.fn(), rows: vi.fn(() => []),
  };
  const runs = new Map<string, Run>();
  const remoteGet = vi.fn();
  let disposing = false;
  let counter = 0;
  let customSettings = options.roleSettings;
  let throwOnce = false;
  const nativeSettings = { current: vi.fn() };
  const agent = {
    runs,
    get disposing() { return disposing; },
    finish: vi.fn(async (id: string, outcome: string) => {
      const run = runs.get(id);
      if (run && run.outcome === undefined) run.outcome = outcome;
      runs.delete(id);
    }),
  };
  const managers = {
    models: { isKnownModel: (h: string, m: string) => enabledModels.has(`${h} ${m}`) },
    acpRecords,
    tab: {
      tabs, launchDir: '/project',
      byLabel: (label: string) => tabs.find((tab) => tab.label === label),
      append, cwdOf: () => '/cwd', addBusy: vi.fn(), deleteBusy: vi.fn(), updateRunning: vi.fn(),
    },
    remote: { get: remoteGet },
    database: { primer: 'db primer', runInTab: vi.fn(), isCommandLine: vi.fn() },
    browser: { run: vi.fn() },
    questions: { register: vi.fn() },
    nativeCommandSettings: nativeSettings,
    agent,
  } as never;
  const askModels = vi.fn((_root: string, role: AcpRole): AcpRoleSettings => ({
    name: role, entries: entries.map((entry) => ({ ...entry })), commands: [...NATIVE_ACP_COMMANDS],
  }));
  const acp = new AcpManager(managers, (root, role) => {
    if (throwOnce) { throwOnce = false; throw new Error('settings unavailable'); }
    return customSettings ? customSettings(root, role) : askModels(root, role);
  });
  Object.assign(managers, { acp });
  for (const tab of tabs) tabRuntime(tab).incarnation = `inc-${tab.label}`;
  const tabOf = (label: string) => tabs.find((tab) => tab.label === label)!;
  const runtimeOf = (label: string) => tabRuntime(tabOf(label));
  const stateOf = (label: string, role: AcpRole) => runtimeOf(label).acpRoles?.[role] ?? {};
  const start = (label = 'tab1', role: AcpRole = 'ask') => acp.start(label, undefined, role);
  const delivered = (label = 'tab1', role: AcpRole = 'ask', overrides: Partial<SubagentDelivery> = {}): SubagentDelivery => ({
    runId: `sub-${++counter}`,
    callerIncarnation: runtimeOf(label).incarnation!,
    callerRole: role,
    callerSessionIdentity: acp.sessionIdentity(label, role) ?? '',
    subagentRole: 'research',
    message: started(`s-${counter}`),
    ...overrides,
  });
  const addRun = (label: string, role: AcpRole, identity: string, incarnation = `inc-${label}`): Run => {
    const id = `run-${++counter}`;
    const run: Run = {
      id, caller: { label, incarnation },
      acpCaller: { role, sessionIdentity: identity, callerId: 'provider-caller' },
    };
    runs.set(id, run);
    return run;
  };
  return {
    acp, managers, tabs, events, append, acpRecords, enabledModels, agent, runs, sessions, askModels,
    nativeSettings, addRun, start, delivered, runtimeOf, stateOf, tabOf,
    setDisposing: (value: boolean) => { disposing = value; },
    setIncarnation: (label: string, value: string) => { runtimeOf(label).incarnation = value; },
    setRoleSettings: (value?: (root: string, role: AcpRole) => AcpRoleSettings) => { customSettings = value; },
    throwSettingsOnce: () => { throwOnce = true; },
    setStillConnecting: (value: boolean) => {
      if (value) {
        tabOf('tab1').remote = { address: 'devbox', host: 'devbox' };
        remoteGet.mockReturnValue({ attached: false });
      } else {
        delete tabOf('tab1').remote;
        remoteGet.mockReturnValue(undefined);
      }
    },
  };
}

type Fixture = ReturnType<typeof setup>;
const loop = (call: number) => mocks.runAcpToolLoop.mock.calls[call][3] as AcpLoopHandlers;
const promptAt = (call: number) => mocks.runAcpToolLoop.mock.calls[call][1] as string;
const depsAt = (call: number) => mocks.runAcpToolLoop.mock.calls[call][2] as { primer?: string };
const answer = (handlers: AcpLoopHandlers, text: string) => { handlers.endTurn(text); handlers.finished('answered', 8); };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const json = (message: SubagentMessage) => serializeSubagentMessage(message);

async function answerDelivery(call: number, f: Fixture, text = 'ack') {
  answer(loop(call), text);
  await flush();
}

describe('subagent delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessions.length = 0;
  });

  it('uses exactly the serializer JSON as the logical prompt, with no envelope or role prefix', async () => {
    const f = setup();
    f.start();
    const env = f.delivered();
    f.acp.deliver('tab1', 'ask', env);
    const expected = json(env.message);
    expect(promptAt(0)).toBe(expected);
    expect(f.stateOf('tab1', 'ask').prompt?.prompt).toBe(expected);
    expect(expected.startsWith('{')).toBe(true);
    expect(expected).not.toContain('runId');
    expect(depsAt(0).primer).toContain('You have no built-in tools; use only the commands listed here.');
    await answerDelivery(0, f);
  });

  it('keeps the ordinary core primer as the first raw provider prompt prefix', async () => {
    const f = setup();
    f.start();
    const env = f.delivered();
    f.acp.deliver('tab1', 'ask', env);
    expect(depsAt(0).primer).toBeTruthy();
    expect(promptAt(0)).toBe(json(env.message));
    await answerDelivery(0, f);
  });

  it('queues a delivery behind a busy typed prompt until it settles', async () => {
    const f = setup();
    f.start();
    const done = vi.fn();
    f.acp.run('tab1', 'ask typed', done);
    const env = f.delivered();
    f.acp.deliver('tab1', 'ask', env);
    expect(mocks.runAcpToolLoop).toHaveBeenCalledTimes(1);
    expect(f.stateOf('tab1', 'ask').pendingSubagentMessages).toHaveLength(1);
    answer(loop(0), 'typed answer');
    await flush();
    expect(mocks.runAcpToolLoop).toHaveBeenCalledTimes(2);
    expect(promptAt(1)).toBe(json(env.message));
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ answered: true, reply: 'typed answer' }));
    await answerDelivery(1, f);
  });

  it('queues a second delivery behind a busy delivered prompt', async () => {
    const f = setup();
    f.start();
    const first = f.delivered();
    const second = f.delivered();
    f.acp.deliver('tab1', 'ask', first);
    f.acp.deliver('tab1', 'ask', second);
    expect(mocks.runAcpToolLoop).toHaveBeenCalledTimes(1);
    expect(f.stateOf('tab1', 'ask').pendingSubagentMessages).toHaveLength(1);
    await answerDelivery(0, f, 'first reply');
    expect(mocks.runAcpToolLoop).toHaveBeenCalledTimes(2);
    expect(promptAt(1)).toBe(json(second.message));
    await answerDelivery(1, f, 'second reply');
  });

  it('keeps ready-order FIFO with one message per prompt', async () => {
    const f = setup();
    f.start();
    f.acp.run('tab1', 'ask typed');
    const envs = [f.delivered(), f.delivered(), f.delivered()];
    for (const env of envs) f.acp.deliver('tab1', 'ask', env);
    answer(loop(0), 'typed');
    await flush();
    for (const [index, call] of [1, 2, 3].entries()) {
      expect(promptAt(call)).toBe(json(envs[index]!.message));
      await answerDelivery(call, f);
    }
  });

  it('drops a queued started by its own completion without moving that completion ahead of a ready message', async () => {
    const f = setup();
    f.start();
    f.acp.run('tab1', 'ask typed');
    const a = f.delivered('tab1', 'ask', {runId: 'A', message: started('A') });
    const b = f.delivered('tab1', 'ask', {runId: 'B', message: started('B') });
    const aDone = f.delivered('tab1', 'ask', {runId: 'A', message: completed('A') });
    f.acp.deliver('tab1', 'ask', a);
    f.acp.deliver('tab1', 'ask', b);
    f.acp.deliver('tab1', 'ask', aDone);
    expect(f.stateOf('tab1', 'ask').pendingSubagentMessages?.map((entry) => entry.runId)).toEqual(['B', 'A']);
    answer(loop(0), 'typed');
    await flush();
    expect(promptAt(1)).toBe(json(b.message));
    await answerDelivery(1, f);
    expect(promptAt(2)).toBe(json(aDone.message));
    await answerDelivery(2, f);
  });

  it('keeps a started already taken for delivery ahead of its later completion', async () => {
    const f = setup();
    f.start();
    const a = f.delivered('tab1', 'ask', {runId: 'A', message: started('A') });
    const aDone = f.delivered('tab1', 'ask', {runId: 'A', message: completed('A') });
    f.acp.deliver('tab1', 'ask', a);
    f.acp.deliver('tab1', 'ask', aDone);
    await answerDelivery(0, f, 'started reply');
    expect(promptAt(0)).toBe(json(a.message));
    expect(promptAt(1)).toBe(json(aDone.message));
    await answerDelivery(1, f, 'completion reply');
  });

  it('keeps ask, tell and two tabs on independent queues and flight tokens', async () => {
    const f = setup({ extraTabs: ['tab2'] });
    f.start('tab1', 'ask');
    f.start('tab1', 'tell');
    f.start('tab2', 'ask');
    const ask1 = f.delivered('tab1', 'ask');
    const tell1 = f.delivered('tab1', 'tell');
    const ask2 = f.delivered('tab2', 'ask');
    f.acp.deliver('tab1', 'ask', ask1);
    f.acp.deliver('tab1', 'tell', tell1);
    f.acp.deliver('tab2', 'ask', ask2);
    expect(mocks.runAcpToolLoop).toHaveBeenCalledTimes(3);
    const tokens = [
      f.stateOf('tab1', 'ask').subagentDeliveryInFlight,
      f.stateOf('tab1', 'tell').subagentDeliveryInFlight,
      f.stateOf('tab2', 'ask').subagentDeliveryInFlight,
    ];
    expect(new Set(tokens).size).toBe(3);
    const queued = f.delivered('tab1', 'ask');
    f.acp.deliver('tab1', 'ask', queued);
    expect(f.stateOf('tab1', 'ask').pendingSubagentMessages).toHaveLength(1);
    expect(f.stateOf('tab1', 'tell').pendingSubagentMessages ?? []).toHaveLength(0);
    for (const call of [0, 1, 2]) await answerDelivery(call, f);
    expect(promptAt(3)).toBe(json(queued.message));
    await answerDelivery(3, f);
  });

  it('still refuses a typed prompt while a delivered prompt runs', async () => {
    const f = setup();
    f.start();
    f.acp.deliver('tab1', 'ask', f.delivered());
    const done = vi.fn();
    f.acp.run('tab1', 'ask typed', done);
    expect(done).toHaveBeenCalledWith({ answered: false, error: 'ACP: a prompt is already running.' });
    expect(mocks.runAcpToolLoop).toHaveBeenCalledTimes(1);
    await answerDelivery(0, f);
  });

  it('publishes a settled background reply before starting the next queued prompt', async () => {
    const f = setup();
    f.start();
    const first = f.delivered();
    const second = f.delivered();
    f.acp.deliver('tab1', 'ask', first);
    f.acp.deliver('tab1', 'ask', second);
    await answerDelivery(0, f, 'first reply');
    expect(f.events).toEqual([
      `prompt:${json(first.message)}`,
      `reply:${ECHO}`,
      `prompt:${json(second.message)}`,
    ]);
    await answerDelivery(1, f, 'second reply');
  });

  it('publishes each immediate refusal once in FIFO order after two synchronous deliveries', async () => {
    const f = setup();
    f.start();
    f.setStillConnecting(true);
    const first = f.delivered();
    const second = f.delivered();
    f.acp.deliver('tab1', 'ask', first);
    f.acp.deliver('tab1', 'ask', second);
    await flush();
    expect(mocks.runAcpToolLoop).not.toHaveBeenCalled();
    const replies = f.append.mock.calls.map((call) => call[1] as { input?: string; output?: string });
    expect(replies).toHaveLength(2);
    expect(replies.map((entry) => entry.input)).toEqual([ECHO, ECHO]);
    expect(replies.every((entry) => entry.output === 'ACP: the remote session is still connecting.')).toBe(true);
    expect(f.stateOf('tab1', 'ask').subagentDeliveryInFlight).toBeUndefined();
  });

  it('publishes a still-connecting session refusal under the exact delivered echo once', async () => {
    const f = setup();
    f.start();
    f.setStillConnecting(true);
    f.acp.deliver('tab1', 'ask', f.delivered());
    await flush();
    expect(f.append).toHaveBeenCalledExactlyOnceWith('tab1', {
      input: ECHO, output: 'ACP: the remote session is still connecting.', background: expect.any(String),
    });
  });

  it('silently drops a queued head whose session identity changed and proceeds to a valid head', async () => {
    const f = setup();
    f.start();
    f.acp.run('tab1', 'ask typed');
    const stale = f.delivered('tab1', 'ask', {callerSessionIdentity: 'acp-stale' });
    const valid = f.delivered();
    f.acp.deliver('tab1', 'ask', stale);
    f.acp.deliver('tab1', 'ask', valid);
    answer(loop(0), 'typed');
    await flush();
    expect(mocks.runAcpToolLoop).toHaveBeenCalledTimes(2);
    expect(promptAt(1)).toBe(json(valid.message));
    await answerDelivery(1, f);
    expect(f.append.mock.calls.filter((call) => (call[1] as { input?: string }).input === ECHO)).toHaveLength(1);
  });

  it('drops a delivery for a missing tab without creating a role runtime', async () => {
    const f = setup();
    f.acp.deliver('missing', 'ask', f.delivered());
    await flush();
    expect(mocks.runAcpToolLoop).not.toHaveBeenCalled();
    expect(f.tabs.some((tab) => tab.label === 'missing')).toBe(false);
  });

  it('drops a delivery on a closing tab', async () => {
    const f = setup();
    f.start();
    f.runtimeOf('tab1').closing = true;
    f.acp.deliver('tab1', 'ask', f.delivered());
    await flush();
    expect(mocks.runAcpToolLoop).not.toHaveBeenCalled();
  });

  it('gives a reused label neither a stale prompt nor an old admitted background reply', async () => {
    const f = setup();
    f.start();
    const env = f.delivered();
    f.acp.deliver('tab1', 'ask', env);
    f.setIncarnation('tab1', 'inc-next');
    answer(loop(0), 'late answer');
    await flush();
    expect(f.append).not.toHaveBeenCalledWith('tab1', expect.objectContaining({ input: ECHO }));
    expect(mocks.runAcpToolLoop).toHaveBeenCalledTimes(1);
  });

  it('drops new arrivals and an already-scheduled drain while the agent manager is disposing', async () => {
    const f = setup();
    f.start();
    f.setDisposing(true);
    f.acp.deliver('tab1', 'ask', f.delivered());
    await flush();
    expect(mocks.runAcpToolLoop).not.toHaveBeenCalled();

    const other = setup();
    other.start();
    other.acp.run('tab1', 'ask typed');
    other.acp.deliver('tab1', 'ask', other.delivered());
    answer(loop(0), 'typed');
    other.setDisposing(true);
    await flush();
    expect(mocks.runAcpToolLoop).toHaveBeenCalledTimes(1);
  });

  it('drops a message before the first attempt when queueFor closes a removed current model', async () => {
    const f = setup();
    const session = f.start();
    f.enabledModels.delete(`${OPENCODE.harness} ${OPENCODE.model}`);
    f.acp.deliver('tab1', 'ask', f.delivered('tab1', 'ask', {callerSessionIdentity: session.session! }));
    await flush();
    expect(mocks.connectAcp).toHaveBeenCalledTimes(1);
    expect(mocks.runAcpToolLoop).not.toHaveBeenCalled();
    expect(f.append).not.toHaveBeenCalled();
    expect(f.stateOf('tab1', 'ask').prompt).toBeUndefined();
  });

  it('drops a message when catalog removal leaves no enabled entry', async () => {
    const f = setup({ entries: [OPENCODE] });
    const session = f.start();
    f.enabledModels.clear();
    f.acp.deliver('tab1', 'ask', f.delivered('tab1', 'ask', {callerSessionIdentity: session.session! }));
    await flush();
    expect(mocks.runAcpToolLoop).not.toHaveBeenCalled();
    expect(f.append).not.toHaveBeenCalled();
  });

  it('repeats the admission check after a role-settings reset between the guard and the attempt', async () => {
    const f = setup();
    const first = f.start();
    f.setRoleSettings((_root, role) => {
      f.setRoleSettings(undefined);
      f.acp.close('tab1');
      f.start();
      return { name: role, entries: [OPENCODE], commands: [...NATIVE_ACP_COMMANDS] };
    });
    f.acp.deliver('tab1', 'ask', f.delivered('tab1', 'ask', {callerSessionIdentity: first.session! }));
    await flush();
    expect(mocks.runAcpToolLoop).not.toHaveBeenCalled();
    expect(f.append).not.toHaveBeenCalled();
  });

  it('repeats the admission check after a native-settings reset between the guard and the attempt', async () => {
    const f = setup();
    const first = f.start();
    f.nativeSettings.current.mockImplementationOnce(() => {
      f.acp.close('tab1');
      f.start();
    });
    f.acp.deliver('tab1', 'ask', f.delivered('tab1', 'ask', {callerSessionIdentity: first.session! }));
    await flush();
    expect(mocks.runAcpToolLoop).not.toHaveBeenCalled();
    expect(f.append).not.toHaveBeenCalled();
  });

  it('rejects a synchronous delivery from a termination callback before the holder identity is deleted', async () => {
    const f = setup();
    const session = f.start();
    const identity = session.session!;
    const run = f.addRun('tab1', 'ask', identity);
    f.agent.finish.mockImplementationOnce(async (id: string, outcome: string) => {
      run.outcome = outcome;
      f.runs.delete(id);
      f.acp.deliver('tab1', 'ask', f.delivered('tab1', 'ask', {callerSessionIdentity: identity }));
    });
    f.acp.close('tab1');
    await flush();
    expect(mocks.runAcpToolLoop).not.toHaveBeenCalled();
    expect(f.append).not.toHaveBeenCalled();
  });

  it('clears the queue and terminates matching runs before the running prompt settles', async () => {
    const f = setup();
    const session = f.start();
    f.acp.run('tab1', 'ask typed');
    f.acp.deliver('tab1', 'ask', f.delivered());
    const run = f.addRun('tab1', 'ask', session.session!);
    f.acp.close('tab1');
    expect(run.outcome).toBe('terminated');
    expect(f.stateOf('tab1', 'ask').pendingSubagentMessages).toBeUndefined();
    await flush();
    expect(mocks.runAcpToolLoop).toHaveBeenCalledTimes(1);
  });

  it('terminates only live runs matching every caller ownership field', async () => {
    const f = setup();
    const session = f.start();
    const identity = session.session!;
    const matching = f.addRun('tab1', 'ask', identity);
    const otherRole = f.addRun('tab1', 'tell', identity);
    const otherIdentity = f.addRun('tab1', 'ask', 'acp-other');
    const otherTab = f.addRun('tab2', 'ask', identity, 'inc-tab2');
    const finished = f.addRun('tab1', 'ask', identity);
    finished.outcome = 'completed';
    f.acp.close('tab1');
    expect(matching.outcome).toBe('terminated');
    expect(otherRole.outcome).toBeUndefined();
    expect(otherIdentity.outcome).toBeUndefined();
    expect(otherTab.outcome).toBeUndefined();
    expect(finished.outcome).toBe('completed');
    expect(() => f.acp.close('tab1')).not.toThrow();
  });

  it('handles a holderless close without terminating session-owned runs', async () => {
    const f = setup();
    const session = f.start();
    const run = f.addRun('tab1', 'ask', session.session!);
    f.acp.close('tab1');
    f.acp.close('tab1');
    expect(f.agent.finish).toHaveBeenCalledTimes(1);
    expect(run.outcome).toBe('terminated');
  });

  it('clears state and skips a run whose caller agent already ended', async () => {
    const f = setup();
    const session = f.start();
    f.acp.deliver('tab1', 'ask', f.delivered());
    const done = f.addRun('tab1', 'ask', session.session!);
    done.outcome = 'failed';
    f.acp.close('tab1');
    expect(f.agent.finish).not.toHaveBeenCalled();
    expect(f.stateOf('tab1', 'ask').pendingSubagentMessages).toBeUndefined();
  });

  it('clears an old session queue and terminates its subagents on admitted fallback without an interleaved drain', async () => {
    const f = setup();
    const session = f.start();
    f.acpRecords.begin.mockReturnValueOnce('record-1').mockReturnValueOnce('record-2');
    const admitted = f.delivered();
    const queued = f.delivered();
    f.acp.deliver('tab1', 'ask', admitted);
    f.acp.deliver('tab1', 'ask', queued);
    const run = f.addRun('tab1', 'ask', session.session!);
    loop(0).error('first model failed');
    await flush();
    expect(run.outcome).toBe('terminated');
    expect(f.stateOf('tab1', 'ask').pendingSubagentMessages).toBeUndefined();
    expect(mocks.runAcpToolLoop).toHaveBeenCalledTimes(2);
    expect(promptAt(1)).toBe(json(admitted.message));
    await answerDelivery(1, f, 'fallback reply');
    expect(f.append.mock.calls.filter((call) => (call[1] as { input?: string }).input === ECHO)).toHaveLength(1);
  });

  it('keeps an admitted delivery ordinary through reset: one close reply, old queue dropped', async () => {
    const f = setup();
    f.start();
    f.acp.deliver('tab1', 'ask', f.delivered());
    f.acp.deliver('tab1', 'ask', f.delivered());
    f.acp.close('tab1');
    await flush();
    const replies = f.append.mock.calls.map((call) => call[1] as { input?: string; output?: string });
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ input: ECHO, output: 'ACP session closed.' });
    expect(mocks.runAcpToolLoop).toHaveBeenCalledTimes(1);
  });

  it('does not let an old result callback clear new tokens or drain after reset and replacement', async () => {
    const f = setup();
    f.start();
    f.acp.deliver('tab1', 'ask', f.delivered());
    f.acp.close('tab1');
    f.start();
    f.acp.deliver('tab1', 'ask', f.delivered());
    await flush();
    expect(mocks.runAcpToolLoop).toHaveBeenCalledTimes(2);
    expect(f.stateOf('tab1', 'ask').subagentDeliveryInFlight).toBeDefined();
    expect(f.stateOf('tab1', 'ask').subagentDrainScheduled).toBeUndefined();
    await answerDelivery(1, f);
    expect(mocks.runAcpToolLoop).toHaveBeenCalledTimes(2);
  });

  it('does not let an old scheduled microtask clear a replacement token or start another prompt', async () => {
    const f = setup();
    f.start();
    f.acp.run('tab1', 'ask first');
    f.acp.deliver('tab1', 'ask', f.delivered());
    answer(loop(0), 'first typed');
    f.acp.close('tab1');
    f.start();
    f.acp.run('tab1', 'ask second');
    f.acp.deliver('tab1', 'ask', f.delivered());
    answer(loop(1), 'second typed');
    await flush();
    expect(mocks.runAcpToolLoop).toHaveBeenCalledTimes(3);
    await answerDelivery(2, f);
  });

  it('settles a rejected delivery once, releases its token, and lets the next valid message progress', async () => {
    const f = setup();
    f.start();
    f.throwSettingsOnce();
    f.acp.deliver('tab1', 'ask', f.delivered());
    await flush();
    const replies = f.append.mock.calls.map((call) => call[1] as { input?: string; output?: string });
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ input: ECHO, output: 'ACP error: settings unavailable' });
    expect(f.stateOf('tab1', 'ask').subagentDeliveryInFlight).toBeUndefined();

    const next = f.delivered();
    f.acp.deliver('tab1', 'ask', next);
    await flush();
    expect(promptAt(0)).toBe(json(next.message));
    await answerDelivery(0, f);
  });
});
