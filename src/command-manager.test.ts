import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandManager } from './command-manager.js';
import { TabManager } from './tab/manager.js';
import type { Managers } from './managers.js';

function makeManagers(): { managers: Managers; recorder: string[] } {
  const recorder: string[] = [];
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
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
  managers.command = new CommandManager(managers);
  return { managers, recorder };
}

describe('CommandManager queue gate', () => {
  it('runs directly when the tab is idle with an empty queue', () => {
    const { managers, recorder } = makeManagers();
    managers.tab.append('janus', { input: '', output: 'before' });
    managers.command.dispatch('clear');
    expect(managers.tab.cur().log).toEqual([]);
    expect(managers.tab.queueFor('janus')).toEqual([]);
    void recorder;
  });

  it('queues submissions while the tab is busy, and does not queue empty input', () => {
    const { managers } = makeManagers();
    managers.tab.append('janus', { input: '', output: 'before' });
    managers.tab.addBusy('janus');

    managers.command.dispatch('clear');
    expect(managers.tab.queueFor('janus')).toEqual(['clear']);
    expect(managers.tab.cur().log).not.toEqual([]); // not run
    expect(managers.tab.cur().log.at(-1)).toEqual({ input: '', output: 'Queued: clear' });

    managers.command.dispatch(' '.repeat(3));
    expect(managers.tab.queueFor('janus')).toEqual(['clear']); // empty input never queues
  });

  it('queues two commands in FIFO order while busy, then drains the first after deleteBusy', async () => {
    const { managers, recorder } = makeManagers();
    managers.tab.addBusy('janus');

    managers.command.dispatch('clear');
    managers.command.dispatch('shell echo hi');
    expect(managers.tab.queueFor('janus')).toEqual(['clear', 'shell echo hi']);
    expect(recorder).toEqual([]);
    expect(managers.tab.cur().log).toEqual([
      { input: '', output: 'Queued: clear' },
      { input: '', output: 'Queued: shell echo hi' },
    ]);

    managers.tab.deleteBusy('janus');
    await Promise.resolve();

    // 'clear' ran (synchronous, doesn't set busy) and the loop continued to the shell command,
    // which set busy again and stopped the drain there.
    expect(recorder).toEqual(['shell:echo hi']);
    expect(managers.tab.queueFor('janus')).toEqual([]);
    expect(managers.tab.isBusy('janus')).toBe(true);
  });

  it('drain runs consecutive non-busy commands until one sets busy', async () => {
    const { managers, recorder } = makeManagers();
    managers.tab.enqueue('janus', 'clear');
    managers.tab.addBusy('janus');
    managers.tab.deleteBusy('janus');
    await Promise.resolve();
    expect(recorder).toEqual([]);
    expect(managers.tab.isBusy('janus')).toBe(false);
  });

  it('dispatch into an idle tab with a non-empty queue enqueues behind and drains FIFO', async () => {
    const { managers, recorder } = makeManagers();
    managers.tab.enqueue('janus', 'clear');
    expect(managers.tab.isBusy('janus')).toBe(false);

    managers.command.dispatch('shell echo hi');

    expect(managers.tab.queueFor('janus')).toEqual([]);
    expect(recorder).toEqual(['shell:echo hi']);
    expect(managers.tab.isBusy('janus')).toBe(true);
  });

  it('appends a Queued: line for a submission that queues behind an idle tab\'s existing queue', () => {
    const { managers } = makeManagers();
    managers.tab.enqueue('janus', 'state');
    expect(managers.tab.isBusy('janus')).toBe(false);

    managers.command.dispatch('shell echo hi');

    expect(managers.tab.cur().log).toContainEqual({ input: '', output: 'Queued: shell echo hi' });
  });

  it('skips the gate for a non-agent tab, running immediately even while busy', () => {
    const { managers } = makeManagers();
    managers.tab.tabs[0].view = 'harness';
    managers.tab.append('janus', { input: '', output: 'before' });
    managers.tab.addBusy('janus');

    managers.command.dispatch('clear');

    expect(managers.tab.queueFor('janus')).toEqual([]);
    expect(managers.tab.cur().log).toEqual([]);
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

describe('CommandManager drain and route chooser', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('stops the drain while a route is pending and resumes via chooseRoute', async () => {
    vi.doMock('./command-router.js', () => ({
      resolveUnknownCommand: (
        cmd: string, label: string, _managers: Managers,
        _run: (input: string, l: string, i: number) => void,
        setPending: (p: { label: string; cmd: string; choices: { label: string; route: 'shell' }[] } | null) => void,
      ) => {
        setPending({ label, cmd, choices: [{ label: 'run in shell', route: 'shell' }] });
      },
    }));
    const { CommandManager: MockedCommandManager } = await import('./command-manager.js');
    const { TabManager: MockedTabManager } = await import('./tab/manager.js');
    const recorder: string[] = [];
    const managers = {} as Managers;
    managers.tab = new MockedTabManager(managers);
    managers.shell = {
      run: vi.fn((label: string, cmd: string) => { recorder.push(`shell:${cmd}`); managers.tab.addBusy(label); }),
    } as unknown as Managers['shell'];
    managers.harness = { run: vi.fn(() => null) } as unknown as Managers['harness'];
    managers.ssh = { run: vi.fn(() => null) } as unknown as Managers['ssh'];
    managers.pty = { openInlinePty: vi.fn() } as unknown as Managers['pty'];
    managers.database = { openDbs: vi.fn(() => []) } as unknown as Managers['database'];
    managers.command = new MockedCommandManager(managers);

    managers.tab.enqueue('janus', 'zzzunknown');
    managers.tab.enqueue('janus', 'clear');
    managers.tab.addBusy('janus');
    managers.tab.deleteBusy('janus');
    await Promise.resolve();

    // The first entry resolved to an unknown command, opened the route chooser, and the drain
    // stopped there — the second entry stays queued.
    expect(managers.tab.queueFor('janus')).toEqual(['clear']);
    expect(managers.command.routeView()).not.toBeNull();

    managers.command.chooseRoute(0);
    expect(recorder).toEqual(['shell:zzzunknown']);
    // The chosen route ran a shell command, which set busy again — the remaining queued entry
    // waits for that completion rather than running immediately.
    expect(managers.tab.queueFor('janus')).toEqual(['clear']);
    expect(managers.tab.isBusy('janus')).toBe(true);

    managers.tab.deleteBusy('janus');
    await Promise.resolve();
    expect(managers.tab.queueFor('janus')).toEqual([]);

    vi.doUnmock('./command-router.js');
  });
});
