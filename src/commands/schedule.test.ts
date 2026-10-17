import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { command } from './schedule.js';
import { createController } from '../controller.js';
import { ScheduleManager } from '../schedule/manager.js';
import { SystemScheduleStore } from '../schedule/system/store.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { ScheduleEntry } from '../schedule/types.js';
import type { LogEntry } from '../tab/types.js';


describe('schedule command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('schedule');
  });

  it('matches schedule commands case-insensitively', () => {
    expect(command.match('schedule every 5m echo hi')).toBe(true);
    expect(command.match('SCHEDULE list')).toBe(true);
    expect(command.match('schedule')).toBe(true);
  });

  it('does not match non-schedule input', () => {
    expect(command.match('scheduled')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});

describe('schedule command run', () => {
  let schedules: Map<string, ScheduleEntry[]>;
  let outputs: string[];
  let tab: { label: string; index: number };
  let managers: unknown;
  let projectRoot: string;
  let systemEntries: { id: string; key: string; script: string; command: string; spec: string; nextRun: number; recurring: boolean }[];
  let systemOwner: { list: () => typeof systemEntries; add: ReturnType<typeof vi.fn>; cancelByName: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn> };
  const schedule = () => schedules.get('janus') ?? [];

  beforeEach(() => {
    schedules = new Map();
    outputs = [];
    projectRoot = mkdtempSync(path.join(tmpdir(), 'system-schedule-command-'));
    mkdirSync(path.join(projectRoot, '.janissary', 'scripts'), { recursive: true });
    writeFileSync(path.join(projectRoot, '.janissary', 'scripts', 'deploy.rs'), 'echo deploy\n');
    systemEntries = [];
    systemOwner = {
      list: () => systemEntries,
      add: vi.fn((entry) => {
        systemEntries.push({ ...entry, key: `key-${systemEntries.length}` });
        return { ok: true };
      }),
      cancelByName: vi.fn((name) => {
        systemEntries = systemEntries.filter((entry) => entry.id !== name);
        return { ok: true };
      }),
      clear: vi.fn(() => { systemEntries = []; return { ok: true }; }),
    };
    tab = { label: 'janus', index: 0 };
    const tabs: { label: string; title?: string; view?: string; harness?: unknown; workspaceDir?: string }[] = [
      { label: 'janus' },
      { label: 'claude', title: 'Reviewer', view: 'harness', harness: { name: 'claude', program: 'claude', ptyId: 'p1', status: 'running' } },
      { label: 'notes', view: 'markdown' },
      { label: 'bekir', view: 'plugin' },
      { label: 'video', view: 'plugin' },
      { label: 'docs', view: 'plugin', workspaceDir: '/repo/.janissary/workspace/docs' },
    ];
    managers = {
      pty: { terminalIdFor: (label: string) => (label === 'bekir' ? 'pty4' : undefined) },
      workspace: { provisioning: () => true },
      schedule: {
        get: (label: string) => schedules.get(label),
        set: (label: string, next: ScheduleEntry[]) => { schedules.set(label, next); },
        openScheduleLaunch: vi.fn(),
      },
      systemSchedule: systemOwner,
      tab: {
        launchDir: projectRoot,
        tabs,
        byLabel: (label: string) => tabs.find((t) => t.label === label),
        append: (_label: string, entry: LogEntry) => { outputs.push(entry.output); },
        persist: () => {},
        buildAgentState: () => ({}),
      },
    };
  });

  afterEach(() => { rmSync(projectRoot, { recursive: true, force: true }); });

  const run = (command_: string) => command.run!(command_, tab, managers as never);

  it('opens the launch dialog for the bare token and records nothing', () => {
    run('schedule');
    expect((managers as typeof managers & { schedule: { openScheduleLaunch: ReturnType<typeof vi.fn> } }).schedule.openScheduleLaunch).toHaveBeenCalledTimes(1);
    expect(outputs).toEqual([]);
  });

  it('adds a named entry and records it', () => {
    run('schedule fetch every 5m echo hi');
    expect(schedule()).toHaveLength(1);
    expect(schedule()[0]).toMatchObject({ id: 'fetch', command: 'echo hi', spec: 'every 5m', recurring: true });
    expect(outputs.at(-1)).toContain('Scheduled fetch');
  });

  it('errors on a named timer with no schedule form and leaves state untouched', () => {
    run('schedule deploy');
    expect(outputs.at(-1)).toContain('Usage:');
    expect(schedule()).toHaveLength(0);
  });

  it('lists entries by name', () => {
    run('schedule a every 5m echo a');
    run('schedule b at 3pm echo b');
    expect(schedule().map((entry) => entry.id)).toEqual(['a', 'b']);

    run('schedule list');
    const listing = outputs.at(-1);
    expect(listing).toContain('a');
    expect(listing).toContain('b');
    expect(listing).toContain('echo a');
  });

  it('cancels a single entry by name', () => {
    run('schedule a every 5m echo a');
    run('schedule b every 1h echo b');
    run('schedule cancel a');
    expect(schedule().map((entry) => entry.id)).toEqual(['b']);
    expect(outputs.at(-1)).toBe('Cancelled a.');
  });

  it('reports cancelling an unknown name', () => {
    run('schedule cancel nope');
    expect(outputs.at(-1)).toBe('No scheduled command "nope".');
  });

  it('clears all entries', () => {
    run('schedule a every 5m echo a');
    run('schedule clear');
    expect(schedule()).toHaveLength(0);
    expect(outputs.at(-1)).toContain('Cleared 1');
  });

  it('rejects a duplicate name', () => {
    run('schedule deploy at 3pm npm run deploy');
    run('schedule deploy every 5m echo hi');
    expect(schedule()).toHaveLength(1);
    expect(outputs.at(-1)).toContain('already exists');
  });

  it('cancels a named entry by name', () => {
    run('schedule deploy at 3pm npm run deploy');
    run('schedule cancel deploy');
    expect(schedule()).toHaveLength(0);
    expect(outputs.at(-1)).toBe('Cancelled deploy.');
  });

  it('stores an `in <tab>` entry under the target tab, not the issuing tab', () => {
    run('schedule standup in claude every day at 9am /standup');
    expect(schedules.get('claude')).toHaveLength(1);
    expect(schedules.get('claude')![0]).toMatchObject({ id: 'standup', command: '/standup' });
    expect(schedule()).toHaveLength(0);
    expect(outputs.at(-1)).toContain('Scheduled standup in claude');
  });

  it('lists, cancels and clears in the target tab', () => {
    run('schedule a in claude every 5m /a');
    run('schedule b in claude every 1h /b');
    run('schedule list in claude');
    expect(outputs.at(-1)).toContain('/a');
    run('schedule cancel a in claude');
    expect(schedules.get('claude')!.map((entry) => entry.id)).toEqual(['b']);
    expect(outputs.at(-1)).toBe('Cancelled a in claude.');
    run('schedule clear in claude');
    expect(schedules.get('claude')).toHaveLength(0);
    expect(outputs.at(-1)).toContain('Cleared 1 scheduled command in claude');
  });

  it('rejects a duplicate name within the target tab only', () => {
    run('schedule deploy at 3pm npm run deploy');
    run('schedule deploy in claude at 3pm /deploy');
    expect(schedules.get('claude')).toHaveLength(1);
    run('schedule deploy in claude every 5m /again');
    expect(schedules.get('claude')).toHaveLength(1);
    expect(outputs.at(-1)).toContain('already exists in claude');
  });

  it('schedules into a tab named by its alias, storing the entry under the canonical label', () => {
    run('schedule standup in reviewer every day at 9am /standup');
    expect(schedules.get('claude')).toHaveLength(1);
    expect(schedules.get('claude')![0]).toMatchObject({ id: 'standup', command: '/standup' });
    expect(schedules.has('reviewer')).toBe(false);
    expect(outputs.at(-1)).toContain('Scheduled standup in claude');
  });

  it('resolves a target label typed in a different case', () => {
    run('schedule standup in Claude every 5m /standup');
    expect(schedules.get('claude')).toHaveLength(1);
    expect(outputs.at(-1)).toContain('Scheduled standup in claude');
  });

  it('lists and cancels in a tab addressed by its alias', () => {
    run('schedule a in claude every 5m /a');
    run('schedule list in REVIEWER');
    expect(outputs.at(-1)).toContain('/a');
    run('schedule cancel a in reviewer');
    expect(schedules.get('claude')).toHaveLength(0);
    expect(outputs.at(-1)).toBe('Cancelled a in claude.');
  });

  it('errors when the target tab does not exist', () => {
    run('schedule x in nobody every 5m echo hi');
    expect(outputs.at(-1)).toBe('No tab named "nobody".');
    expect(schedules.size).toBe(0);
  });

  it('errors when the target tab is a view that cannot run commands', () => {
    run('schedule x in notes every 5m echo hi');
    expect(outputs.at(-1)).toBe('Tab "notes" cannot run scheduled commands.');
    expect(schedules.size).toBe(0);
  });

  it('accepts a plugin tab that owns a terminal, such as a shell tab', () => {
    run('schedule fetch in bekir every 5m git fetch');
    expect(schedules.get('bekir')?.[0]).toMatchObject({ id: 'fetch', command: 'git fetch' });
    expect(outputs.at(-1)).toContain('Scheduled fetch in bekir');
  });

  it('accepts a schedule issued from a shell tab for itself', () => {
    tab = { label: 'bekir', index: 3 };
    run('schedule fetch every 5m git fetch');
    expect(schedules.get('bekir')).toHaveLength(1);
  });

  it('refuses a plugin tab whose workspace clone is still provisioning', () => {
    run('schedule x in docs every 5m echo hi');
    expect(outputs.at(-1)).toBe('Tab "docs" cannot run scheduled commands.');
    expect(schedules.size).toBe(0);
  });

  it('still refuses a plugin tab with no terminal to type into', () => {
    run('schedule x in video every 5m echo hi');
    expect(outputs.at(-1)).toBe('Tab "video" cannot run scheduled commands.');
    expect(schedules.size).toBe(0);
  });

  it('routes system creation to the project owner and prints exact output', () => {
    run('schedule system deploy at 3pm script deploy');
    expect(systemOwner.add).toHaveBeenCalledWith(expect.objectContaining({
      id: 'deploy', script: 'deploy', command: 'script deploy', spec: 'at 3:00pm',
    }));
    expect(outputs.at(-1)).toBe('Scheduled deploy system: at 3:00pm (script deploy).');
    expect(schedule()).toEqual([]);
  });

  it('refuses missing or unsafe scripts without changing the owner', () => {
    run('schedule system missing at 3pm script absent');
    expect(outputs.at(-1)).toBe('No runscript named "absent".');
    symlinkSync('deploy.rs', path.join(projectRoot, '.janissary', 'scripts', 'unsafe.rs'));
    run('schedule system unsafe at 3pm script unsafe');
    expect(outputs.at(-1)).toBe('Could not read runscript "unsafe".');
    expect(systemOwner.add).not.toHaveBeenCalled();
  });

  it('lists, cancels every same-named system entry, and clears with exact messages', () => {
    systemEntries = [
      { id: 'same', key: '1', script: 'deploy', command: 'script deploy', spec: 'at 3pm', nextRun: Date.now(), recurring: false },
      { id: 'same', key: '2', script: 'deploy', command: 'script deploy', spec: 'every 5m', nextRun: Date.now(), recurring: true },
    ];
    run('schedule system list');
    expect(outputs.at(-1)).toContain('same  at 3pm  (next:');
    expect(outputs.at(-1)).toContain('script deploy');
    run('schedule system cancel same');
    expect(outputs.at(-1)).toBe('Cancelled same in system.');
    expect(systemEntries).toEqual([]);
    run('schedule system cancel same');
    expect(outputs.at(-1)).toBe('No scheduled command "same" in system.');
    systemEntries.push({ id: 'once', key: '3', script: 'deploy', command: 'script deploy', spec: 'at 3pm', nextRun: Date.now(), recurring: false });
    run('schedule system clear');
    expect(outputs.at(-1)).toBe('Cleared 1 scheduled commands in system.');
    run('schedule system list');
    expect(outputs.at(-1)).toBe('No scheduled commands in system.');
  });

  it('does not report success when the project owner cannot save', () => {
    systemOwner.add.mockReturnValue({ ok: false, error: 'disk full' });
    run('schedule system deploy at 3pm script deploy');
    expect(outputs.at(-1)).toBe('Could not save system schedule.');
  });

  it('prints the management save error without claiming cancel or clear succeeded', () => {
    systemEntries = [{ id: 'deploy', key: '1', script: 'deploy', command: 'script deploy', spec: 'at 3pm', nextRun: Date.now(), recurring: false }];
    systemOwner.cancelByName.mockReturnValue({ ok: false, error: 'disk full' });
    run('schedule system cancel deploy');
    expect(outputs.at(-1)).toBe('Could not save system schedules.');
    systemOwner.clear.mockReturnValue({ ok: false, error: 'disk full' });
    run('schedule system clear');
    expect(outputs.at(-1)).toBe('Could not save system schedules.');
  });
});

describe('schedule command lifecycle callbacks', () => {
  let managers: Managers;
  let schedule: ScheduleManager;
  let output: string[];

  beforeEach(() => {
    const tab = { label: 'janus', index: 0 };
    output = [];
    managers = {
      tab: {
        tabs: [tab],
        byLabel: (label: string) => (label === tab.label ? tab : undefined),
        append: (_label: string, entry: LogEntry) => { output.push(entry.output); },
      },
    } as unknown as Managers;
    schedule = new ScheduleManager(managers);
    managers.schedule = schedule;
  });

  afterEach(() => { schedule.dispose(); });

  const run = (input: string) => command.run!(input, { label: 'janus', index: 0 }, managers);

  it('settles an auto-resume hook when the CLI cancels its entry', () => {
    const removed = vi.fn();
    schedule.add('janus', {
      id: 'auto-resume', command: 'resume', spec: 'at 3pm', nextRun: Date.now() + 60_000, recurring: false,
    }, { removed });

    run('schedule cancel auto-resume');

    expect(removed).toHaveBeenCalledOnce();
    expect(output).toEqual(['Cancelled auto-resume.']);
  });

  it('settles every auto-resume hook when the CLI clears the schedule', () => {
    const firstRemoved = vi.fn();
    const secondRemoved = vi.fn();
    for (const [id, removed] of [['first', firstRemoved], ['second', secondRemoved]] as const) {
      schedule.add('janus', {
        id, command: 'resume', spec: 'at 3pm', nextRun: Date.now() + 60_000, recurring: false,
      }, { removed });
    }

    run('schedule clear');

    expect(firstRemoved).toHaveBeenCalledOnce();
    expect(secondRemoved).toHaveBeenCalledOnce();
    expect(schedule.get('janus')).toEqual([]);
  });
});

describe('system schedule command persistence', () => {
  it('routes a real command through parsing and the persisted project owner', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'system-schedule-command-store-'));
    mkdirSync(path.join(root, '.janissary', 'scripts'), { recursive: true });
    writeFileSync(path.join(root, '.janissary', 'scripts', 'deploy.rs'), 'echo deploy\n');
    const sinks = { emitState: () => {}, sendPty: () => {}, sendPtyExit: () => {} };
    const controller = createController(sinks, root);
    try {
      const issuingTab = makeTab('janus');
      controller.managers.tab.tabs.push(issuingTab);
      command.run!('schedule system release at 5pm script deploy', { label: issuingTab.label, index: 0 }, controller.managers);
      const persisted = new SystemScheduleStore(root).load();
      expect(persisted).toMatchObject({ ok: true, snapshot: { version: 1, entries: [
        { id: 'release', script: 'deploy', command: 'script deploy', spec: 'at 5:00pm' },
      ] } });
      controller.managers.systemSchedule.dispose();
      const restarted = createController(sinks, root);
      restarted.managers.systemSchedule.load();
      expect(restarted.managers.systemSchedule.list()).toMatchObject([{ id: 'release', script: 'deploy' }]);
      await restarted.shutdown();
    } finally {
      await controller.shutdown();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
