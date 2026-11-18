import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type * as nodeOs from 'node:os';
import type * as Glob from '../file-glob/glob.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type { Managers } from '../managers.js';
import { AgentRun } from '../agent/run.js';
import { CommandManager } from '../command/manager.js';
import { TabManager } from '../tab/manager.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import { makeTab } from '../tab/index.js';
import { commands } from '../commands/index.js';
import { NativeCommandSettingsManager } from '../native-commands/manager.js';
import { NotificationQueue } from '../notifications/queue.js';
import { Questions } from '../questions.js';
import { createSubagentAttemptHost } from './attempt-host.js';

const mocks = vi.hoisted(() => ({ globWorkspaceCommand: vi.fn(), homedir: vi.fn(() => '') }));
vi.mock('node:os', async (importOriginal) => ({
  ...await importOriginal<typeof nodeOs>(), homedir: mocks.homedir,
}));
vi.mock('../file-glob/glob.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Glob>();
  mocks.globWorkspaceCommand.mockImplementation(actual.globWorkspaceCommand);
  return { ...actual, globWorkspaceCommand: mocks.globWorkspaceCommand };
});

const runs: AgentRun[] = [];
const roots: string[] = [];

function scratch(): { clone: string; caller: string; home: string } {
  const base = mkdtempSync(path.join(tmpdir(), 'subagent-attempt-host-'));
  roots.push(base);
  const clone = path.join(base, 'clone');
  const caller = path.join(base, 'caller');
  const home = path.join(base, 'home');
  mkdirSync(clone);
  mkdirSync(caller);
  mkdirSync(home);
  mocks.homedir.mockReturnValue(home);
  return { clone, caller, home };
}

function setup(executionDir: string, overrides: Partial<Parameters<typeof createSubagentAttemptHost>[0]> = {}) {
  const caller = { label: 'caller', incarnation: 'inc-1', cwd: '/caller-cwd', context: ['ctx-a', 'ctx-b'] };
  const run = new AgentRun(caller, {
    taskPath: 'task.md', taskText: 'TASK', skills: [], grants: [],
  }, undefined, undefined, executionDir);
  runs.push(run);
  const signal = new AbortController().signal;
  const invocation: CommandInvocationContext = {
    runId: 'launch-run', invocationId: 'launch-inv', caller, signal,
    systemSchedule: { id: 'sched-1', tick: 7 } as never,
  };
  const dispatch = vi.fn(async () => ({ dispatched: true, output: '' }));
  const managers = { command: { dispatchNativeLine: dispatch } } as unknown as Managers;
  const active = () => !run.outcome && !run.abortController.signal.aborted;
  const host = createSubagentAttemptHost({ run, invocation, managers, executionDir, active, ...overrides });
  return { run, invocation, dispatch, managers, host, active, signal };
}

beforeEach(() => {
  mocks.globWorkspaceCommand.mockClear();
  runs.length = 0;
  roots.length = 0;
});
afterEach(async () => {
  for (const run of runs) if (run.outcome === undefined) await run.finish('completed');
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('createSubagentAttemptHost', () => {
  it('routes all five granted file commands to the clone and leaves caller files untouched', async () => {
    const { clone, caller } = scratch();
    writeFileSync(path.join(clone, 'a.md'), 'one\ntwo\n');
    writeFileSync(path.join(clone, 'note.txt'), 'TODO here\n');
    writeFileSync(path.join(caller, 'a.md'), 'caller one\n');
    const { host } = setup(clone);

    expect(await host.runWorkspace('file read a.md')).toBe('1\tone\n2\ttwo');
    expect(await host.runWorkspace('file glob *.md')).toBe('a.md');
    expect(await host.runWorkspace('file grep TODO')).toBe('note.txt:1: TODO here');
    expect(await host.runWorkspace('file write {"path":"new.md","content":"made"}')).toBe('Wrote new.md.');
    expect(await host.runWorkspace('file edit {"path":"a.md","oldString":"one","newString":"uno"}'))
      .toBe('Edited a.md (1 replacements).');
    expect(await host.runWorkspace('file read ../caller/a.md')).toMatch(/^Outside the workspace/);

    expect(readFileSync(path.join(clone, 'new.md'), 'utf8')).toBe('made');
    expect(readFileSync(path.join(clone, 'a.md'), 'utf8')).toBe('uno\ntwo\n');
    expect(existsSync(path.join(caller, 'new.md'))).toBe(false);
    expect(readFileSync(path.join(caller, 'a.md'), 'utf8')).toBe('caller one\n');
  });

  it('passes the run abort signal to a workspace glob', async () => {
    const { clone } = scratch();
    writeFileSync(path.join(clone, 'a.md'), 'one\n');
    const { host, run } = setup(clone);
    await host.runWorkspace('file glob *.md');
    expect(mocks.globWorkspaceCommand).toHaveBeenCalledWith(clone, 'file glob *.md', run.abortController.signal);
  });

  it('forwards captured caller fields with a fresh child id and run-owned settings', async () => {
    const { clone } = scratch();
    const { host, run, invocation, dispatch } = setup(clone);
    dispatch.mockResolvedValue({ dispatched: true, output: '' });
    await host.runCaller('db sqlite list');
    const [, command, forwarded] = dispatch.mock.calls[0] as [string, string, CommandInvocationContext];
    expect(command).toBe('db sqlite list');
    expect(forwarded.caller).toEqual(invocation.caller);
    expect(forwarded.caller.cwd).toBe('/caller-cwd');
    expect(forwarded.caller.context).toEqual(['ctx-a', 'ctx-b']);
    expect(forwarded.caller.incarnation).toBe('inc-1');
    expect(forwarded.runId).toBe(run.id);
    expect(forwarded.signal).toBe(run.abortController.signal);
    expect(forwarded.signal).not.toBe(invocation.signal);
    expect(forwarded.acpRole).toBe('ask');
    expect(forwarded.acpTool).toBe(true);
    expect(forwarded.awaitResult).toBe(true);
    expect(forwarded.systemSchedule).toEqual(invocation.systemSchedule);
    expect(forwarded.invocationId).not.toBe(invocation.invocationId);
  });

  it('attributes a tab created by a real native command to the run', async () => {
    const { clone } = scratch();
    const root = mkdtempSync(path.join(tmpdir(), 'subagent-attempt-host-manager-'));
    roots.push(root);
    const managers = {} as Managers;
    managers.tab = new TabManager(managers);
    seedRootTab(managers.tab);
    const trackCreatedTab = vi.fn();
    managers.agent = { runs: new Map(), trackCreatedTab } as unknown as Managers['agent'];
    managers.database = { openDbs: vi.fn(() => []), runInTab: vi.fn(() => 'query result') } as unknown as Managers['database'];
    managers.browser = { run: vi.fn(async () => 'browser result') } as unknown as Managers['browser'];
    managers.questions = new Questions();
    managers.notifications = new NotificationQueue();
    managers.nativeCommandSettings = new NativeCommandSettingsManager(root, root);
    managers.command = new CommandManager(managers);
    const caller = { label: 'janus', incarnation: 'inc', cwd: '/repo', context: [] as string[] };
    const run = new AgentRun(caller, { taskPath: 'task.md', taskText: 'TASK', skills: [], grants: [] }, undefined, undefined, clone);
    runs.push(run);
    managers.agent.runs.set(run.id, run);
    const invocation: CommandInvocationContext = {
      runId: 'launch-run', invocationId: 'inv', caller, signal: run.abortController.signal,
    };
    const command = {
      name: 'fixture-attempt-tab', match: (input: string) => input === 'fixture-attempt-tab',
      samples: ['fixture-attempt-tab'],
      run: (_input: string, _tab: unknown, services: Managers) => {
        services.tab.tabs.push(makeTab('created-by-attempt', '#ccc', 2));
      },
    };
    commands.push(command);
    try {
      const host = createSubagentAttemptHost({
        run, invocation, managers, executionDir: clone, active: () => true,
      });
      await host.runCaller('fixture-attempt-tab');
      expect(trackCreatedTab).toHaveBeenCalledWith(run.id, 'created-by-attempt');
    } finally {
      commands.splice(commands.indexOf(command), 1);
    }
  });

  it('returns ordinary and core-response string results verbatim, including empty', async () => {
    const { clone } = scratch();
    const { host, dispatch } = setup(clone);
    dispatch.mockResolvedValueOnce({ dispatched: true, output: 'from output', result: 'ordinary string' });
    await expect(host.runCaller('db sqlite query')).resolves.toBe('ordinary string');
    dispatch.mockResolvedValueOnce({ dispatched: true, output: '', coreResponse: true, result: '' });
    await expect(host.runCaller('ask hello')).resolves.toBe('');
    dispatch.mockResolvedValueOnce({ dispatched: true, output: 'kept output', coreResponse: true, result: 'core string' });
    await expect(host.runCaller('ask hello')).resolves.toBe('core string');
  });

  it('returns captured output for core-response objects, undefined results and ordinary undefined', async () => {
    const { clone } = scratch();
    const { host, dispatch } = setup(clone);
    dispatch.mockResolvedValueOnce({ dispatched: true, output: 'core output', coreResponse: true, result: { a: 1 } });
    await expect(host.runCaller('ask hello')).resolves.toBe('core output');
    dispatch.mockResolvedValueOnce({ dispatched: true, output: 'core output', coreResponse: true });
    await expect(host.runCaller('ask hello')).resolves.toBe('core output');
    dispatch.mockResolvedValueOnce({ dispatched: true, output: 'ordinary output' });
    await expect(host.runCaller('db sqlite query')).resolves.toBe('ordinary output');
  });

  it('JSON-serializes ordinary objects and falls back to String when serialization yields undefined', async () => {
    const { clone } = scratch();
    const { host, dispatch } = setup(clone);
    dispatch.mockResolvedValueOnce({ dispatched: true, output: '', result: { a: 1, b: [2, 3] } });
    await expect(host.runCaller('db sqlite query')).resolves.toBe('{"a":1,"b":[2,3]}');
    dispatch.mockResolvedValueOnce({ dispatched: true, output: '', result: Symbol('tag') });
    await expect(host.runCaller('db sqlite query')).resolves.toBe('Symbol(tag)');
  });

  it('rejects an undispatched result before mapping and passes a dispatch throw through untouched', async () => {
    const { clone } = scratch();
    const { host, dispatch } = setup(clone);
    dispatch.mockResolvedValueOnce({ dispatched: false, output: 'ignored', result: 'value' });
    await expect(host.runCaller('unknown command')).rejects.toThrow('No ACP tool matched command: unknown command');
    dispatch.mockRejectedValueOnce(new Error('dispatch exploded'));
    await expect(host.runCaller('db sqlite list')).rejects.toThrow('dispatch exploded');
  });

  it('waits through a question and restores Running only while the attempt is active', async () => {
    const { clone } = scratch();
    const { host, run, dispatch } = setup(clone);
    const answerQuestion = Promise.withResolvers<{ dispatched: boolean; output: string; result: string }>();
    dispatch.mockImplementation(() => answerQuestion.promise);
    const pending = host.runCaller('question ask "x"');
    expect(run.view().status).toBe('Waiting for answer');
    answerQuestion.resolve({ dispatched: true, output: 'answer', result: 'answer' });
    await expect(pending).resolves.toBe('answer');
    expect(run.view().status).toBe('Running');
  });

  it('does no further work for a late caller request or pending result after the attempt ends', async () => {
    const { clone } = scratch();
    const { host, run, dispatch } = setup(clone);
    const answerQuestion = Promise.withResolvers<{ dispatched: boolean; output: string; result: string }>();
    dispatch.mockImplementation(() => answerQuestion.promise);
    const pending = host.runCaller('question ask "x"');
    expect(run.view().status).toBe('Waiting for answer');
    await run.finish('terminated');
    expect(run.view().status).toBe('Terminated');
    answerQuestion.resolve({ dispatched: true, output: 'late answer', result: 'late answer' });
    await expect(pending).resolves.toBe('late answer');
    expect(run.view().status).toBe('Terminated');
    await expect(host.runCaller('db sqlite list')).rejects.toThrow('Subagent attempt ended.');
    expect(() => host.runWorkspace('file read a.md')).toThrow('Subagent attempt ended.');
  });
});
