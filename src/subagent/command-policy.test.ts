import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../managers.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type { Tab, TabRuntime } from '../tab/types.js';
import type { AcpDispatchReceipt } from '../acp/response.js';
import type * as LaunchModule from './launch.js';
import type * as TaskResolutionModule from '../agent/task-resolution.js';
import type { SubagentLaunchOptions } from './launch.js';
import { initWorkspaceDir, workspacePath } from '../workspace/index.js';
import { createControllerTestProject } from '../controller/test-project.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import { deferred } from '../deferred.js';
import { SUBAGENT_FLAG_USAGE, SUBAGENT_JSON_USAGE } from './parse.js';
import { runSubagentCommand } from './command-policy.js';

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
  realLaunch: undefined as unknown,
  resolve: vi.fn(),
}));
vi.mock('./launch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof LaunchModule>();
  mocks.realLaunch = actual.launchSubagent;
  return { ...actual, launchSubagent: (options: SubagentLaunchOptions, managers: Managers) => mocks.launch(options, managers) };
});
vi.mock('../agent/task-resolution.js', async (importOriginal) => {
  const actual = await importOriginal<typeof TaskResolutionModule>();
  return { ...actual, resolveAgentSnapshot: mocks.resolve };
});

const roots: string[] = [];
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
  vi.restoreAllMocks();
  mocks.launch.mockReset();
  mocks.resolve.mockReset();
});

function directories(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'command-policy-'));
  roots.push(root);
  return root;
}

function writeRoles(root: string, roles: Record<string, unknown>): void {
  mkdirSync(path.join(root, '.janissary'), { recursive: true });
  writeFileSync(path.join(root, '.janissary', 'roles.json'), JSON.stringify(roles));
}

const A = { harness: 'opencode', model: 'model-a' };
const B = { harness: 'claude', model: 'model-b', effort: 'high' };
const C = { harness: 'codex', model: 'model-c', effort: 'low' };
const RECEIPT: Extract<AcpDispatchReceipt, { kind: 'record' }> = {
  replyId: 'reply-1', kind: 'record', recordId: 'record-1', name: 'subagent:Research',
};

function researchRoles(entries: unknown = [A]): Record<string, unknown> {
  return { research: { description: 'ignored', entries, commands: ['file read'] } };
}

function invocation(overrides: Partial<CommandInvocationContext> = {}): CommandInvocationContext {
  return {
    runId: 'run-1', invocationId: 'inv-1',
    caller: { label: 'caller', cwd: '/caller-cwd', context: [] },
    signal: new AbortController().signal,
    ...overrides,
  };
}

function fixture(options?: {
  root?: string;
  known?: (harness: string, model: string) => boolean;
  view?: string;
  incarnation?: string;
  closing?: boolean;
  label?: string;
}) {
  const label = options?.label ?? 'caller';
  const tab = { label, index: 0, view: options?.view ?? 'shell' } as Tab;
  const runtime: TabRuntime = {
    busy: false, context: [], queue: [],
    ...(options?.incarnation !== undefined && { incarnation: options.incarnation }),
    ...(options?.closing && { closing: true }),
  };
  tab.runtime = runtime;
  const appended: Array<{ input: string; output: string; background?: string; backgroundRecord?: unknown }> = [];
  const isKnownModel = vi.fn(options?.known ?? (() => true));
  const managers = {
    tab: {
      launchDir: options?.root ?? '',
      byLabel: (want: string) => want === label ? tab : undefined,
      append: (want: string, entry: (typeof appended)[number]) => { if (want === label) appended.push(entry); },
    },
    models: { isKnownModel },
  } as unknown as Managers;
  return { managers, tab, runtime, appended, isKnownModel };
}

const FLAGS = 'subagent --role research --task task.md';
const JSON_LINE = 'subagent {"role":"research","task":"task.md"}';

function success(options: SubagentLaunchOptions, expected: { task: string; context?: string }): void {
  expect(options).toMatchObject({
    label: 'caller', task: expected.task, commandText: expect.any(String),
    settings: expect.any(Object), entries: expect.any(Array),
  });
  if (expected.context === undefined) expect(options.context).toBeUndefined();
  else expect(options.context).toBe(expected.context);
}

describe('runSubagentCommand — caller and form', () => {
  const acpCases = [
    ['ask tool loop', invocation({ acpTool: true, acpRole: 'ask' }), 'shell'],
    ['tell tool loop', invocation({ acpTool: true, acpRole: 'tell' }), 'shell'],
    ['plugin prompt tool', invocation({ acpTool: true, acpRole: 'ask' }), 'plugin'],
  ] as const;

  it.each(acpCases)('ACP %s uses JSON and refuses the flag form with the JSON usage', (_name, inv, view) => {
    const root = directories();
    writeRoles(root, researchRoles());
    const { managers, appended } = fixture({ root, view });
    mocks.launch.mockReturnValue(RECEIPT);

    expect(runSubagentCommand(JSON_LINE, { label: 'caller', index: 0 }, managers, inv)).toBe('');
    success(mocks.launch.mock.calls[0][0], { task: 'task.md' });
    expect(mocks.launch.mock.calls[0][0].invocation).toBe(inv);

    mocks.launch.mockClear();
    expect(runSubagentCommand(FLAGS, { label: 'caller', index: 0 }, managers, inv)).toBe(SUBAGENT_JSON_USAGE);
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(appended).toHaveLength(0);
  });

  const humanCases = [
    ['typed', undefined, 'shell'],
    ['scheduled', invocation({ systemSchedule: { kind: 'system-schedule', scheduleKey: 'nightly' } }), 'shell'],
    ['queued', invocation({ awaitResult: true }), 'shell'],
    ['plugin command', invocation(), 'plugin'],
    ['ACP-capable tab without the marker', invocation({ acpRole: 'tell' }), 'ask'],
  ] as const;

  it.each(humanCases)('%s uses flags and refuses the JSON form with the flag usage', (_name, inv, view) => {
    const root = directories();
    writeRoles(root, researchRoles());
    const { managers, appended } = fixture({ root, view });
    mocks.launch.mockReturnValue(RECEIPT);

    expect(runSubagentCommand(FLAGS, { label: 'caller', index: 0 }, managers, inv)).toBe(RECEIPT);
    success(mocks.launch.mock.calls[0][0], { task: 'task.md' });
    if (inv === undefined) expect(mocks.launch.mock.calls[0][0].invocation).toBeUndefined();
    else expect(mocks.launch.mock.calls[0][0].invocation).toBe(inv);

    mocks.launch.mockClear();
    expect(runSubagentCommand(JSON_LINE, { label: 'caller', index: 0 }, managers, inv)).toBeUndefined();
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(appended).toHaveLength(1);
    expect(appended[0].output).toBe(SUBAGENT_FLAG_USAGE);
  });

  const contextCases = [
    ['omitted invocation', undefined, FLAGS, undefined],
    ['role-only metadata', invocation({ acpRole: 'ask' }), FLAGS, undefined],
    ['awaitResult-only metadata', invocation({ awaitResult: true }), FLAGS, undefined],
    ['truthy nontrue marker', invocation({ acpTool: 1 as unknown as true }), FLAGS, undefined],
  ] as const;

  it.each(contextCases)('successful flags preserve context with %s', (_name, inv, command) => {
    const root = directories();
    writeRoles(root, researchRoles());
    const { managers } = fixture({ root });
    mocks.launch.mockReturnValue(RECEIPT);

    expect(runSubagentCommand(command, { label: 'caller', index: 0 }, managers, inv)).toBe(RECEIPT);
    success(mocks.launch.mock.calls[0][0], { task: 'task.md' });
  });

  it('preserves an omitted, an empty and a multiline decoded context verbatim', () => {
    const root = directories();
    writeRoles(root, researchRoles());
    const { managers } = fixture({ root });
    const commands = [
      FLAGS,
      `${FLAGS} --context ""`,
      `${FLAGS} --context "line one\nline two"`,
    ];
    mocks.launch.mockReturnValue(RECEIPT);
    for (const command of commands) runSubagentCommand(command, { label: 'caller', index: 0 }, managers);
    expect(mocks.launch.mock.calls.map((call) => call[0].context)).toEqual([
      undefined, '', 'line one\nline two',
    ]);
  });
});

describe('runSubagentCommand — caller usage override', () => {
  const malformed = [
    ['bare', 'subagent'],
    ['malformed JSON', 'subagent {"role":'],
    ['invalid flags', 'subagent --bogus x'],
    ['JSON array', 'subagent ["role"]'],
  ] as const;

  it.each(malformed)('ACP refuses %s with the JSON usage before role lookup', (_name, command) => {
    const root = directories();
    writeRoles(root, researchRoles());
    const { managers, appended } = fixture({ root });
    expect(runSubagentCommand(command, { label: 'caller', index: 0 }, managers, invocation({ acpTool: true })))
      .toBe(SUBAGENT_JSON_USAGE);
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(appended).toHaveLength(0);
  });

  it.each(malformed)('a person refuses %s with the flag usage before role lookup', (_name, command) => {
    const root = directories();
    writeRoles(root, researchRoles());
    const { managers, appended } = fixture({ root });
    expect(runSubagentCommand(command, { label: 'caller', index: 0 }, managers)).toBeUndefined();
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(appended).toHaveLength(1);
    expect(appended[0].output).toBe(SUBAGENT_FLAG_USAGE);
  });

  it('uses the caller usage even when the malformed input appeared to choose the other form', () => {
    const root = directories();
    writeRoles(root, researchRoles());
    const { managers, appended } = fixture({ root });
    expect(runSubagentCommand('subagent --role research', { label: 'caller', index: 0 }, managers, invocation({ acpTool: true })))
      .toBe(SUBAGENT_JSON_USAGE);
    expect(runSubagentCommand('subagent {"role":"research"}', { label: 'caller', index: 0 }, managers))
      .toBeUndefined();
    expect(appended[0].output).toBe(SUBAGENT_FLAG_USAGE);
    expect(mocks.launch).not.toHaveBeenCalled();
  });
});

describe('runSubagentCommand — role selection', () => {
  it('matches the role trimmed and in any case and keeps the canonical name', () => {
    const root = directories();
    writeRoles(root, { ' Research ': { description: 'ignored', entries: [A], commands: ['x'] } });
    const { managers } = fixture({ root });
    mocks.launch.mockReturnValue(RECEIPT);
    runSubagentCommand('subagent --role   rEsEaRcH  --task task.md', { label: 'caller', index: 0 }, managers);
    expect(mocks.launch.mock.calls[0][0].settings.name).toBe('Research');
  });

  it('reports an unknown role with only the trimmed input echoed', () => {
    const root = directories();
    writeRoles(root, researchRoles());
    const { managers, appended } = fixture({ root });
    expect(runSubagentCommand('subagent --role "  nosuch  " --task task.md', { label: 'caller', index: 0 }, managers))
      .toBeUndefined();
    expect(appended[0].output).toBe('Subagent: unknown role "nosuch".');
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('reports a known role with no entries as listing no models', () => {
    const root = directories();
    writeRoles(root, { custom: { description: 'ignored', entries: [], commands: [] } });
    const { managers, appended } = fixture({ root });
    expect(runSubagentCommand('subagent --role custom --task task.md', { label: 'caller', index: 0 }, managers))
      .toBeUndefined();
    expect(appended[0].output).toBe('Subagent: the custom role lists no models.');
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('reports an all-disabled role as listing no models', () => {
    const root = directories();
    writeRoles(root, researchRoles([A, B]));
    const { managers, appended } = fixture({ root, known: () => false });
    expect(runSubagentCommand(FLAGS, { label: 'caller', index: 0 }, managers)).toBeUndefined();
    expect(appended[0].output).toBe('Subagent: the research role lists no models.');
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('preserves order, duplicates, effort, canonical settings and saved grants after filtering', () => {
    const root = directories();
    const entries = [A, B, { ...A, effort: 'low' }, C];
    writeRoles(root, researchRoles(entries));
    const { managers } = fixture({ root, known: (harness) => harness === 'opencode' });
    mocks.launch.mockReturnValue(RECEIPT);
    runSubagentCommand(FLAGS, { label: 'caller', index: 0 }, managers);
    const options = mocks.launch.mock.calls[0][0];
    expect(options.entries).toEqual([A, { ...A, effort: 'low' }]);
    expect(options.settings).toMatchObject({ name: 'research', entries, commands: ['file read'] });
    expect(options.settings.entries).not.toBe(entries);
    expect(entries).toHaveLength(4);
  });

  it('reads a later roles-file edit fresh', () => {
    const root = directories();
    writeRoles(root, researchRoles([A]));
    const { managers } = fixture({ root });
    mocks.launch.mockReturnValue(RECEIPT);
    runSubagentCommand(FLAGS, { label: 'caller', index: 0 }, managers);
    expect(mocks.launch.mock.calls[0][0].settings.entries).toEqual([A]);
    writeRoles(root, researchRoles([B]));
    runSubagentCommand(FLAGS, { label: 'caller', index: 0 }, managers);
    expect(mocks.launch.mock.calls[1][0].settings.entries).toEqual([B]);
  });

  it('uses launchDir rather than a distinct local caller cwd as the settings root', () => {
    const root = directories();
    writeRoles(root, researchRoles([A]));
    const { managers } = fixture({ root });
    const inv = invocation({ caller: { label: 'caller', cwd: '/elsewhere', context: [] } });
    mocks.launch.mockReturnValue(RECEIPT);
    expect(runSubagentCommand(FLAGS, { label: 'caller', index: 0 }, managers, inv)).toBe(RECEIPT);
    expect(mocks.launch.mock.calls[0][0].settings.name).toBe('research');
  });

  it('uses launchDir rather than a remote caller path as the settings root', () => {
    const root = directories();
    writeRoles(root, researchRoles([A]));
    const { managers } = fixture({ root });
    const inv = invocation({ caller: { label: 'caller', cwd: '/remote/project', context: ['remote'] } });
    mocks.launch.mockReturnValue(RECEIPT);
    expect(runSubagentCommand(FLAGS, { label: 'caller', index: 0 }, managers, inv)).toBe(RECEIPT);
    expect(mocks.launch.mock.calls[0][0].settings.entries).toEqual([A]);
  });
});

describe('runSubagentCommand — original line and receipt', () => {
  it('echoes invocation.line on a live human refusal with one fresh id and no record', () => {
    const root = directories();
    const { managers, appended } = fixture({ root });
    const line = '  /SUBAGENT --role nosuch --task task.md  ';
    expect(runSubagentCommand('subagent --role nosuch --task task.md', { label: 'caller', index: 0 }, managers, invocation({ line })))
      .toBeUndefined();
    expect(appended).toHaveLength(1);
    expect(appended[0].input).toBe(line);
    expect(appended[0].output).toBe('Subagent: unknown role "nosuch".');
    expect(appended[0].background).toMatch(/^[0-9a-f-]{36}$/);
    expect(appended[0].backgroundRecord).toBeUndefined();
  });

  it('preserves invocation.line through launcher options and returns the exact receipt', () => {
    const root = directories();
    writeRoles(root, researchRoles());
    const { managers } = fixture({ root });
    const line = '  /subagent --role research --task task.md  ';
    mocks.launch.mockReturnValue(RECEIPT);
    const result = runSubagentCommand(FLAGS, { label: 'caller', index: 0 }, managers, invocation({ line }));
    expect(result).toBe(RECEIPT);
    expect(mocks.launch.mock.calls[0][0].invocation.line).toBe(line);
    expect(mocks.launch.mock.calls[0][0].commandText).toBe(FLAGS);
  });
});

describe('runSubagentCommand — synchronous launch failures', () => {
  const failures = [
    ['missing caller', 'Agent caller not found: caller'],
    ['closing caller', 'Agent caller is closing: caller'],
    ['stale caller', 'Agent caller is stale: caller'],
    ['disposed manager', 'Agent run manager is disposed.'],
  ] as const;

  it.each(failures)('ACP returns the exact %s error with no human reply', (_name, message) => {
    const root = directories();
    writeRoles(root, researchRoles());
    const { managers, appended } = fixture({ root });
    mocks.launch.mockImplementation(() => { throw new Error(message); });
    expect(runSubagentCommand(JSON_LINE, { label: 'caller', index: 0 }, managers, invocation({ acpTool: true })))
      .toBe(message);
    expect(appended).toHaveLength(0);
  });

  it.each(failures)('a person appends the exact %s error only for a safe recipient', (_name, message) => {
    const root = directories();
    writeRoles(root, researchRoles());
    const { managers, appended } = fixture({ root });
    mocks.launch.mockImplementation(() => { throw new Error(message); });
    expect(runSubagentCommand(FLAGS, { label: 'caller', index: 0 }, managers)).toBeUndefined();
    expect(appended).toHaveLength(1);
    expect(appended[0].output).toBe(message);
    expect(mocks.launch.mock.calls[0][0]).toMatchObject({ label: 'caller', entries: [A] });
  });

  it.each([
    ['missing ACP role', {}],
    ['missing internal identity', { acpRole: 'ask' as const }],
    ['missing provider id', { acpRole: 'tell' as const }],
  ])('ACP returns the exact session error for %s', (_name, overrides) => {
    const root = directories();
    writeRoles(root, researchRoles());
    const { managers, appended } = fixture({ root });
    mocks.launch.mockImplementation(() => { throw new Error('Subagent: caller session is not available.'); });
    expect(runSubagentCommand(JSON_LINE, { label: 'caller', index: 0 }, managers, invocation({ acpTool: true, ...overrides })))
      .toBe('Subagent: caller session is not available.');
    expect(appended).toHaveLength(0);
  });

  it.each([
    ['ACP', invocation({ acpTool: true })],
    ['person', undefined],
  ])('preserves a multiline source error unchanged through the %s sink', (_name, inv) => {
    const root = directories();
    writeRoles(root, researchRoles());
    const { managers, appended } = fixture({ root });
    const source = 'first line\n  second line\nthird line';
    mocks.launch.mockImplementation(() => { throw new Error(source); });
    const result = runSubagentCommand(inv ? JSON_LINE : FLAGS, { label: 'caller', index: 0 }, managers, inv);
    if (inv) expect(result).toBe(source);
    else {
      expect(result).toBeUndefined();
      expect(appended[0].output).toBe(source);
    }
  });

  it('suppresses a human refusal for a missing, closing or stale caller', () => {
    const root = directories();
    writeRoles(root, researchRoles());
    const message = 'Agent: command not permitted: nothing';
    for (const options of [
      { label: 'missing' },
      { closing: true },
      { incarnation: 'stale' },
    ]) {
      const { managers, appended } = fixture({ root, ...options });
      mocks.launch.mockImplementation(() => { throw new Error(message); });
      const inv = options.incarnation ? invocation({ caller: { label: 'caller', cwd: '/cwd', context: [], incarnation: 'old' } }) : undefined;
      expect(runSubagentCommand(FLAGS, { label: 'caller', index: 0 }, managers, inv)).toBeUndefined();
      expect(appended).toHaveLength(0);
    }
  });

  it('does not convert a post-receipt error into a second immediate refusal', () => {
    const root = directories();
    writeRoles(root, researchRoles());
    const { managers, appended } = fixture({ root });
    mocks.launch.mockReturnValue(RECEIPT);
    expect(runSubagentCommand(FLAGS, { label: 'caller', index: 0 }, managers)).toBe(RECEIPT);
    expect(appended).toHaveLength(0);
  });
});

const project = createControllerTestProject();

describe('runSubagentCommand — post-creation boundary', () => {
  let scratch: string;
  let controller: ReturnType<typeof project.create>;
  let caller: Tab;
  let provisioning: ReturnType<typeof deferred<void>>;

  beforeEach(() => {
    scratch = mkdtempSync(path.join(tmpdir(), 'command-policy-launch-'));
    initWorkspaceDir(scratch, path.join(scratch, '.claude.json'));
    controller = project.create();
    caller = seedRootTab(controller.managers.tab);
    provisioning = deferred<void>();
    vi.spyOn(controller.managers.workspace, 'create').mockImplementation((name: string) => ({
      dir: workspacePath(name), ready: provisioning.promise, cancel: () => provisioning.resolve(),
    }));
    vi.spyOn(controller.managers.workspace, 'acquireAgentLease').mockReturnValue(vi.fn(async () => {}));
    mocks.resolve.mockImplementation(() => { throw new Error('Agent: unknown task "task.md".'); });
    mocks.launch.mockImplementation((options: SubagentLaunchOptions, managers: Managers) =>
      (mocks.realLaunch as (o: SubagentLaunchOptions, m: Managers) => AcpDispatchReceipt)(options, managers));
  });

  afterEach(async () => {
    provisioning.resolve();
    await project.dispose();
    rmSync(scratch, { recursive: true, force: true });
  });

  async function drain(times = 40) {
    provisioning.resolve();
    for (let index = 0; index < times; index += 1) await Promise.resolve();
  }

  it.each([
    ['person', undefined],
    ['ACP', invocation({ acpTool: true, acpRole: 'ask' })],
  ])('a %s gets an immediate result then only the launcher failed completion', async (_name, inv) => {
    mkdirSync(path.join(controller.managers.tab.launchDir, '.janissary'), { recursive: true });
    writeFileSync(path.join(controller.managers.tab.launchDir, '.janissary', 'roles.json'), JSON.stringify({
      research: { description: 'ignored', entries: [A], commands: [] },
    }));
    vi.spyOn(controller.managers.models, 'isKnownModel').mockReturnValue(true);
    vi.spyOn(controller.managers.acp, 'sessionIdentity').mockReturnValue('identity-1');
    vi.spyOn(controller.managers.acp, 'providerSessionId').mockReturnValue('provider-1');
    const deliver = vi.spyOn(controller.managers.acp, 'deliver').mockImplementation(() => {});
    const acp = inv !== undefined;
    const command = acp ? JSON_LINE : FLAGS;
    const line = `  ${command}  `;

    const result = runSubagentCommand(command, { label: caller.label, index: 0 }, controller.managers,
      invocation({ ...inv, line }));
    if (acp) expect(result).toBe('');
    else expect(result).toMatchObject({ kind: 'record', name: 'subagent:research' });

    expect(caller.log ?? []).toHaveLength(0);
    await drain();
    if (acp) {
      expect(deliver).toHaveBeenCalledTimes(1);
      const delivery = deliver.mock.calls[0][2];
      expect(delivery.message).toMatchObject({ status: 'failed', output: 'Agent: unknown task "task.md".' });
      expect(caller.log ?? []).toHaveLength(0);
    } else {
      expect(caller.log ?? []).toHaveLength(1);
      expect(caller.log![0].output).toBe('Subagent research failed.\n\nAgent: unknown task "task.md".');
      expect(deliver).not.toHaveBeenCalled();
    }
  });
});
