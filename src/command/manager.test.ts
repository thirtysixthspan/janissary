import { describe, it, expect, vi } from 'vitest';
import { CommandManager } from './manager.js';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';

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
  it('awaits a successful plugin command', async () => {
    const { managers } = makeManagers();
    const deferred = Promise.withResolvers<void>();
    const runCommand = vi.fn(() => deferred.promise);
    managers.plugins = { runCommand } as unknown as Managers['plugins'];

    const completed = managers.command.executeCommand('video', 'video clip.mp4', 'janus', 0);
    expect(runCommand).toHaveBeenCalledWith(
      'video', 'video clip.mp4', { label: 'janus', command: 'video clip.mp4' },
    );
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
    expect(runCommand).toHaveBeenCalledWith('search', 'search', { label: 'janus', command: 'search' });

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
    vi.spyOn(managers.command, 'executeCommand').mockImplementation(async (_name, command, label) => {
      await Promise.resolve();
      managers.tab.append(label, { input: command, output: 'async response' });
    });

    await expect(managers.command.dispatchLineWithOutput('janus', 'theme dark')).resolves.toEqual({
      dispatched: true, output: 'async response',
    });
  });

  it('leaves shell and unknown lines undispatched', async () => {
    const { managers } = makeManagers();

    await expect(managers.command.dispatchLineWithOutput('janus', 'ls -la')).resolves.toEqual({
      dispatched: false, output: '',
    });
  });

  // Nothing above this wait bounds it any more — the plugin asking is not charged for the command's
  // runtime — so a command that never finishes answers with what it said by the capture limit.
  it('answers with the output so far when a command outlives the capture limit', async () => {
    const { managers } = makeManagers();
    const late = Promise.withResolvers<void>();
    vi.spyOn(managers.command, 'executeCommand').mockImplementation(async (_name, command, label) => {
      managers.tab.append(label, { input: command, output: 'started' });
      await late.promise;
      managers.tab.append(label, { input: command, output: 'finished' });
    });

    await expect(managers.command.dispatchLineWithOutput('janus', 'theme dark', 10)).resolves.toEqual({
      dispatched: true, output: 'started',
    });
    late.resolve();
    await vi.waitFor(() => { expect(managers.tab.cur().log.at(-1)?.output).toBe('finished'); });
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
