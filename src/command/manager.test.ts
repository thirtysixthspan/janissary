import { describe, it, expect, vi } from 'vitest';
import { CommandManager } from './manager.js';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import { makeTab } from '../tab/index.js';
import { commands } from '../commands/index.js';
import type { CommandInvocationContext } from '../commands/types.js';

function makeManagers(): { managers: Managers; recorder: string[] } {
  const recorder: string[] = [];
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  seedRootTab(managers.tab);
  managers.shell = {
    run: vi.fn((label: string, cmd: string) => {
      recorder.push(`shell:${cmd}`);
      managers.tab.addBusy(label);
    }),
  } as unknown as Managers['shell'];
  managers.harness = { run: vi.fn(() => null), openLaunchDialog: vi.fn() } as unknown as Managers['harness'];
  managers.ssh = { run: vi.fn(() => null) } as unknown as Managers['ssh'];
  managers.pty = { openInlinePty: vi.fn() } as unknown as Managers['pty'];
  managers.database = { openDbs: vi.fn(() => []) } as unknown as Managers['database'];
  managers.schedule = {
    openScheduleLaunch: vi.fn(), get: vi.fn(() => []), set: vi.fn(),
  } as unknown as Managers['schedule'];
  managers.command = new CommandManager(managers);
  return { managers, recorder };
}

describe('CommandManager async commands', () => {
  it('records new tab allocations from a run-owned granted command', async () => {
    const { managers } = makeManagers();
    const trackCreatedTab = vi.fn();
    managers.agent = { runs: new Map([['run-1', {}]]), trackCreatedTab } as unknown as Managers['agent'];
    const command = {
      name: 'fixture-tab-allocation', match: (input: string) => input === 'fixture-tab-allocation',
      samples: ['fixture-tab-allocation'],
      run: (_input: string, _tab: unknown, services: Managers) => {
        services.tab.tabs.push(makeTab('created-by-command', '#ccc', 2));
      },
    };
    commands.push(command);
    try {
      await managers.command.dispatchLineInInvocation('janus', 'fixture-tab-allocation', {
        runId: 'run-1', invocationId: 'invocation-1',
        caller: { label: 'janus', cwd: '/repo', context: [] }, signal: new AbortController().signal,
      });

      expect(trackCreatedTab).toHaveBeenCalledWith('run-1', 'created-by-command');
    } finally {
      commands.splice(commands.indexOf(command), 1);
    }
  });

  it('awaits a successful plugin command', async () => {
    const { managers } = makeManagers();
    const deferred = Promise.withResolvers<void>();
    const runCommand = vi.fn(() => deferred.promise);
    managers.plugins = { runCommand } as unknown as Managers['plugins'];

    const completed = managers.command.executeCommand('video', 'video clip.mp4', 'janus', 0);
    expect(runCommand).toHaveBeenCalledWith('video', 'video clip.mp4', {
      label: 'janus', command: 'video clip.mp4', invocationId: expect.any(String), runId: expect.any(String),
    });
    deferred.resolve();
    await completed;
  });

  it('turns an async command rejection into transcript output', async () => {
    const { managers } = makeManagers();
    managers.plugins = {
      runCommand: vi.fn(async () => { throw new Error('async plugin rejected'); }),
    } as unknown as Managers['plugins'];

    await managers.command.executeCommand('video', 'video clip.mp4', 'janus', 0);

    expect(managers.tab.cur().log.at(-1)).toEqual({
      input: 'video clip.mp4', output: 'async plugin rejected',
    });
  });

  it('runs the command that matches the input, not the first with that name', async () => {
    // A plugin command and a built-in can share a name when the built-in answers only to a longer
    // form of it: the search tab claims `search`, and the transcript search is registered as `search`
    // while matching only `search transcript …`. A bare `search` must reach the plugin, so the
    // lookup has to test `match` rather than take the first entry carrying the name.
    const { managers } = makeManagers();
    const runCommand = vi.fn();
    managers.plugins = { runCommand } as unknown as Managers['plugins'];

    await managers.command.executeCommand('search', 'search', 'janus', 0);
    expect(runCommand).toHaveBeenCalledWith('search', 'search', {
      label: 'janus', command: 'search', invocationId: expect.any(String), runId: expect.any(String),
    });

    runCommand.mockClear();
    await managers.command.executeCommand('search', 'search transcript fox', 'janus', 0);
    // The built-in's own form still reaches the built-in, so the pair coexists.
    expect(runCommand).not.toHaveBeenCalled();
    expect(managers.tab.cur().log.at(-1)?.output).toContain('transcript');
  });
});

describe('CommandManager dispatchLineWithOutput', () => {
  it('returns the output from an output-only application command', async () => {
    const { managers } = makeManagers();

    const result = await managers.command.dispatchLineWithOutput('janus', 'help');

    expect(result.dispatched).toBe(true);
    expect(result.output.length).toBeGreaterThan(0);
    expect(managers.tab.cur().log.at(-1)?.output).toBe(result.output);
  });

  it('captures output appended by the existing async command executor', async () => {
    const { managers } = makeManagers();
    vi.spyOn(managers.command as unknown as { executeCommandWithContext: (...args: unknown[]) => Promise<unknown> }, 'executeCommandWithContext')
      .mockImplementation(async (_name, command, label, _index, invocation) => {
      await Promise.resolve();
      managers.tab.appendForInvocation(label, { input: command, output: 'async response' }, invocation.invocationId);
    });

    await expect(managers.command.dispatchLineWithOutput('janus', 'theme dark')).resolves.toEqual({
      dispatched: true, output: 'async response',
    });
  });

  it('leaves forced shell and unknown lines undispatched for plugin callers', async () => {
    const { managers } = makeManagers();

    await expect(managers.command.dispatchLineWithOutput('janus', '!printf probe')).resolves.toEqual({
      dispatched: false, output: '',
    });
    managers.command.dispatch('!printf probe');
    expect(managers.shell.run).toHaveBeenCalledWith('janus', 'printf probe');
    await expect(managers.command.dispatchLineWithOutput('janus', 'ls -la')).resolves.toEqual({
      dispatched: false, output: '',
    });
  });

  it('dispatches a shell plugin launcher from a shell command bar', async () => {
    const { managers } = makeManagers();
    const runCommand = vi.fn(async () => {});
    managers.plugins = { runCommand } as unknown as Managers['plugins'];

    await expect(managers.command.dispatchLineWithOutput('janus', 'shell pr1760 -w')).resolves.toEqual({
      dispatched: true, output: '',
    });

    expect(runCommand).toHaveBeenCalledWith('shell', 'shell pr1760 -w', {
      label: 'janus', command: 'shell pr1760 -w',
      invocationId: expect.any(String), runId: expect.any(String),
    });
  });

  // Nothing above this wait bounds it any more — the plugin asking is not charged for the command's
  // runtime — so a command that never finishes answers with what it said by the capture limit.
  it('answers with the output so far when a command outlives the capture limit', async () => {
    const { managers } = makeManagers();
    const late = Promise.withResolvers<void>();
    vi.spyOn(managers.command as unknown as { executeCommandWithContext: (...args: unknown[]) => Promise<unknown> }, 'executeCommandWithContext')
      .mockImplementation(async (_name, command, label, _index, invocation) => {
      managers.tab.appendForInvocation(label, { input: command, output: 'started' }, invocation.invocationId);
      await late.promise;
      managers.tab.appendForInvocation(label, { input: command, output: 'finished' }, invocation.invocationId);
    });

    await expect(managers.command.dispatchLineWithOutput('janus', 'theme dark', 10)).resolves.toEqual({
      dispatched: true, output: 'started',
    });
    late.resolve();
    await vi.waitFor(() => { expect(managers.tab.cur().log.at(-1)?.output).toBe('finished'); });
  });
});

describe('CommandManager shell command', () => {
  it.each([
    ['!ls -la', 'ls -la'],
    ['! git status', 'git status'],
    ['!', ''],
  ])('runs %s through the registry with the shell body', (input, body) => {
    const { managers } = makeManagers();

    managers.command.dispatch(input);

    expect(managers.shell.run).toHaveBeenCalledWith('janus', body);
  });
});

describe('CommandManager structured results', () => {
  it('captures schedule provenance at dispatch and copies it into child invocation contexts', async () => {
    const { managers } = makeManagers();
    let childInvocation: CommandInvocationContext | undefined;
    const child = {
      name: 'fixture-schedule-child', match: (input: string) => input === 'fixture-schedule-child',
      samples: ['fixture-schedule-child'], structuredResult: true as const,
      run: (_input: string, _tab: unknown, _services: Managers, invocation: CommandInvocationContext) => {
        childInvocation = invocation;
        return { response: 'scheduled child' };
      },
    };
    const parent = {
      name: 'fixture-schedule-parent', match: (input: string) => input === 'fixture-schedule-parent',
      samples: ['fixture-schedule-parent'], structuredResult: true as const,
      run: async (_input: string, _tab: unknown, services: Managers, invocation: CommandInvocationContext) =>
        services.command.dispatchLineInInvocation('janus', 'fixture-schedule-child', invocation),
    };
    commands.push(child, parent);
    try {
      const provenance = Object.freeze({ kind: 'system-schedule' as const, scheduleKey: 'daily-build' });
      await managers.command.dispatchQueuedLine('janus', 'fixture-schedule-parent', provenance);
      expect(childInvocation?.systemSchedule).toEqual(provenance);
      expect(Object.isFrozen(childInvocation?.systemSchedule)).toBe(true);
    } finally {
      commands.splice(commands.indexOf(child), 1);
      commands.splice(commands.indexOf(parent), 1);
    }
  });

  it('returns a structured result together with the output it appended', async () => {
    const { managers } = makeManagers();
    const command = {
      name: 'fixture-result', match: (input: string) => input === 'fixture-result',
      samples: ['fixture-result'], structuredResult: true as const,
      run: async (_input: string, tab: { label: string }, services: Managers, invocation: CommandInvocationContext) => {
        services.tab.appendForInvocation(tab.label, { input: 'fixture-result', output: 'displayed once' }, invocation.invocationId);
        return { status: 'completed', response: 'result value' };
      },
    };
    commands.push(command);
    try {
      await expect(managers.command.dispatchLineWithOutput('janus', 'fixture-result')).resolves.toEqual({
        dispatched: true, output: 'displayed once', result: { status: 'completed', response: 'result value' },
      });
      expect(managers.tab.cur().log.at(-1)?.output).toBe('displayed once');
    } finally {
      commands.splice(commands.indexOf(command), 1);
    }
  });

  it('keeps output appended after the legacy 30-second deadline', async () => {
    vi.useFakeTimers();
    const { managers } = makeManagers();
    const command = {
      name: 'fixture-late-result', match: (input: string) => input === 'fixture-late-result',
      samples: ['fixture-late-result'], structuredResult: true as const,
      run: async (_input: string, tab: { label: string }, services: Managers, invocation: CommandInvocationContext) => {
        await new Promise((resolve) => { setTimeout(resolve, 30_001); });
        services.tab.appendForInvocation(tab.label, { input: 'fixture-late-result', output: 'late reply' }, invocation.invocationId);
        return { status: 'completed', response: 'late result' };
      },
    };
    commands.push(command);
    try {
      const reply = managers.command.dispatchLineWithOutput('janus', 'fixture-late-result');
      await vi.advanceTimersByTimeAsync(30_001);
      await expect(reply).resolves.toEqual({
        dispatched: true, output: 'late reply', result: { status: 'completed', response: 'late result' },
      });
    } finally {
      commands.splice(commands.indexOf(command), 1);
      vi.useRealTimers();
    }
  });

  it('keeps core-response no-capture behavior while returning a structured result', async () => {
    const { managers } = makeManagers();
    const command = {
      name: 'fixture-core-result', match: (input: string) => input === 'fixture-core-result',
      samples: ['fixture-core-result'], structuredResult: true as const, coreResponse: true,
      run: () => ({ response: 'core result' }),
    };
    commands.push(command);
    try {
      await expect(managers.command.dispatchLineWithOutput('janus', 'fixture-core-result')).resolves.toEqual({
        dispatched: true, output: '', coreResponse: true, result: { response: 'core result' },
      });
    } finally {
      commands.splice(commands.indexOf(command), 1);
    }
  });

  it('does not settle a structured result at the legacy 30-second capture deadline', async () => {
    vi.useFakeTimers();
    const { managers } = makeManagers();
    const completion = Promise.withResolvers<{ status: string }>();
    const command = {
      name: 'fixture-slow-result', match: (input: string) => input === 'fixture-slow-result',
      samples: ['fixture-slow-result'], structuredResult: true as const,
      run: () => completion.promise,
    };
    commands.push(command);
    try {
      let settled = false;
      const result = (async () => {
        const reply = await managers.command.dispatchLineWithOutput('janus', 'fixture-slow-result');
        settled = true;
        return reply;
      })();
      await vi.advanceTimersByTimeAsync(30_001);
      expect(settled).toBe(false);
      completion.resolve({ status: 'completed' });
      await expect(result).resolves.toEqual({
        dispatched: true, output: '', result: { status: 'completed' },
      });
    } finally {
      commands.splice(commands.indexOf(command), 1);
      vi.useRealTimers();
    }
  });

  it('delivers nested results directly while retaining run ownership', async () => {
    const { managers } = makeManagers();
    let parentInvocation: CommandInvocationContext | undefined;
    let childInvocation: CommandInvocationContext | undefined;
    const child = {
      name: 'fixture-child-result', match: (input: string) => input === 'fixture-child-result',
      samples: ['fixture-child-result'], structuredResult: true as const,
      run: (_input: string, _tab: unknown, _services: Managers, invocation: CommandInvocationContext) => {
        childInvocation = invocation;
        return { response: 'nested answer' };
      },
    };
    const parent = {
      name: 'fixture-parent-result', match: (input: string) => input === 'fixture-parent-result',
      samples: ['fixture-parent-result'], structuredResult: true as const,
      run: async (_input: string, _tab: unknown, services: Managers, invocation: CommandInvocationContext) => {
        parentInvocation = invocation;
        return services.command.dispatchLineInInvocation('janus', 'fixture-child-result', invocation);
      },
    };
    commands.push(child, parent);
    try {
      await expect(managers.command.dispatchLineWithOutput('janus', 'fixture-parent-result')).resolves.toMatchObject({
        dispatched: true, result: { dispatched: true, result: { response: 'nested answer' } },
      });
      expect(childInvocation?.runId).toBe(parentInvocation?.runId);
      expect(childInvocation?.invocationId).not.toBe(parentInvocation?.invocationId);
      expect(childInvocation?.caller).toEqual(parentInvocation?.caller);
    } finally {
      commands.splice(commands.indexOf(child), 1);
      commands.splice(commands.indexOf(parent), 1);
    }
  });

  it('creates invocation ownership internally for ordinary dispatch', async () => {
    const { managers } = makeManagers();
    const runCommand = vi.fn();
    managers.plugins = { runCommand } as unknown as Managers['plugins'];

    const forged = {
      runId: 'caller-controlled-run', invocationId: 'caller-controlled-invocation',
      caller: { label: 'elsewhere', cwd: '/elsewhere', context: ['forged'] }, signal: new AbortController().signal,
    };
    Reflect.apply(managers.command.executeCommand, managers.command, [
      'video', 'video clip.mp4', 'janus', 0, forged,
    ]);
    await vi.waitFor(() => { expect(runCommand).toHaveBeenCalledOnce(); });

    const [pluginId, , origin] = runCommand.mock.calls[0] as unknown as [string, string, Record<string, unknown>];
    expect(pluginId).toBe('video');
    expect(origin.invocationId).toEqual(expect.any(String));
    expect(origin.invocationId).not.toBe(forged.invocationId);
    expect(origin.runId).toEqual(expect.any(String));
    expect(origin.runId).not.toBe(forged.runId);
  });
});

describe('CommandManager bare-harness launch dialog', () => {
  it('opens the launch dialog for bare `harness` and records no transcript line', () => {
    const { managers } = makeManagers();
    managers.command.dispatch('harness');
    expect(managers.harness.openLaunchDialog).toHaveBeenCalledTimes(1);
    expect(managers.harness.run).not.toHaveBeenCalled();
    expect(managers.tab.cur().log).toEqual([]);
  });

  it('treats `harness` with trailing whitespace as bare and opens the dialog', () => {
    const { managers } = makeManagers();
    managers.command.dispatch('harness \t');
    expect(managers.harness.openLaunchDialog).toHaveBeenCalledTimes(1);
    expect(managers.harness.run).not.toHaveBeenCalled();
  });

  it('still appends the input and runs for a non-empty `harness <name>` command', () => {
    const { managers } = makeManagers();
    managers.command.dispatch('harness claude');
    expect(managers.harness.openLaunchDialog).not.toHaveBeenCalled();
    expect(managers.harness.run).toHaveBeenCalledWith('harness claude');
    expect(managers.tab.cur().log).toContainEqual({ input: 'harness claude', output: '' });
  });
});

// Both reach their manager through the registry now rather than through a branch ahead of it; what
// the typed path does with the input and the returned error string is unchanged.
describe('CommandManager delegating harness and ssh', () => {
  it('hands the whole input to the ssh manager and appends the input line', () => {
    const { managers } = makeManagers();
    managers.command.dispatch('ssh build-box -p 2222');
    expect(managers.ssh.run).toHaveBeenCalledWith('ssh build-box -p 2222');
    expect(managers.tab.cur().log).toContainEqual({ input: 'ssh build-box -p 2222', output: '' });
  });

  it.each([
    ['harness', 'harness nope', 'Unknown harness "nope".'],
    ['ssh', 'ssh', 'Usage: ssh <destination>'],
  ])('appends the error string %s answers with', (manager, text, error) => {
    const { managers } = makeManagers();
    (managers[manager as 'harness' | 'ssh'].run as ReturnType<typeof vi.fn>).mockReturnValue(error);
    managers.command.dispatch(text);
    expect(managers.tab.cur().log).toContainEqual({ input: '', output: error });
  });

  it('appends nothing beyond the input line when the manager answers with no error', () => {
    const { managers } = makeManagers();
    managers.command.dispatch('ssh build-box');
    expect(managers.tab.cur().log).toEqual([{ input: 'ssh build-box', output: '' }]);
  });
});

describe('CommandManager bare-schedule launch dialog', () => {
  it('opens the schedule dialog for bare `schedule` and records no transcript line', () => {
    const { managers } = makeManagers();
    managers.command.dispatch('schedule');
    expect(managers.schedule.openScheduleLaunch).toHaveBeenCalledTimes(1);
    expect(managers.tab.cur().log).toEqual([]);
  });

  it('treats `schedule` with trailing whitespace as bare and opens the dialog', () => {
    const { managers } = makeManagers();
    managers.command.dispatch('schedule \t');
    expect(managers.schedule.openScheduleLaunch).toHaveBeenCalledTimes(1);
  });

  it('still dispatches `schedule list` to the schedule command', () => {
    const { managers } = makeManagers();
    managers.command.dispatch('schedule list');
    expect(managers.schedule.openScheduleLaunch).not.toHaveBeenCalled();
    expect(managers.tab.cur().log).toContainEqual({ input: 'schedule list', output: 'No scheduled commands.' });
  });

  it('still dispatches a full schedule creation form to the schedule command', () => {
    const { managers } = makeManagers();
    managers.command.dispatch('schedule fetch every 5m echo hi');
    expect(managers.schedule.openScheduleLaunch).not.toHaveBeenCalled();
    expect(managers.schedule.set).toHaveBeenCalled();
  });
});
