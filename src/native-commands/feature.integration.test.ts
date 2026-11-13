import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Managers } from '../managers.js';
import { CommandManager } from '../command/manager.js';
import { TabManager } from '../tab/manager.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import { NotificationQueue } from '../notifications/queue.js';
import { Questions } from '../questions.js';
import { NativeCommandSettingsManager } from './manager.js';
import { projectDisabledApplicationCommands } from './state.js';
import { readCommandsTopic, runCommandsTopicAction } from '../plugins/commands-topic.js';
import { commandRestrictionsFrom } from '../plugins/roles/command-policy.js';
import { commandNameCandidates, completionPolicy } from '../completion/command-policy.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';
import { createAcpToolTable, toolExtractor, toolPrimer } from '../acp/tool-table.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function fixture(): {
  home: string; managers: Managers; settings: NativeCommandSettingsManager;
} {
  const base = mkdtempSync(path.join(os.tmpdir(), 'native-command-feature-'));
  roots.push(base);
  const root = path.join(base, 'project');
  const home = path.join(base, 'home');
  mkdirSync(root);
  mkdirSync(home);
  const settings = new NativeCommandSettingsManager(root, home);
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  seedRootTab(managers.tab);
  managers.shell = { run: vi.fn() } as unknown as Managers['shell'];
  managers.harness = { run: vi.fn(() => null), openLaunchDialog: vi.fn() } as unknown as Managers['harness'];
  managers.ssh = { run: vi.fn(() => null) } as unknown as Managers['ssh'];
  managers.pty = { openInlinePty: vi.fn() } as unknown as Managers['pty'];
  managers.database = {
    primer: 'database primer', openDbs: vi.fn(() => []), runInTab: vi.fn(() => 'query result'),
    isCommandLine: vi.fn(() => true),
  } as unknown as Managers['database'];
  managers.browser = {
    run: vi.fn(async () => 'browser result'), runInteractive: vi.fn(),
  } as unknown as Managers['browser'];
  managers.questions = new Questions();
  managers.schedule = {
    openScheduleLaunch: vi.fn(), get: vi.fn(() => []), set: vi.fn(),
  } as unknown as Managers['schedule'];
  managers.notifications = new NotificationQueue();
  managers.nativeCommandSettings = settings;
  managers.command = new CommandManager(managers);
  return { home, managers, settings };
}

function persisted(home: string): unknown {
  return JSON.parse(readFileSync(path.join(home, '.janissary', 'commands.json'), 'utf8'));
}

describe('native command settings across the feature seams', () => {
  it('projects, persists, restricts, dispatches, queues, and completes one disabled setting', async () => {
    const { home, managers } = fixture();

    await expect(runCommandsTopicAction(managers, {
      topic: 'commands', action: 'set', name: 'browser', setting: 'enabled', value: false,
    })).resolves.toBeUndefined();

    expect(persisted(home)).toHaveProperty('browser', { enabled: false, agentAccess: true });
    const snapshot = readCommandsTopic(managers);
    expect(snapshot.commands.find(({ name }) => name === 'browser'))
      .toMatchObject({ enabled: false, effectiveEnabled: false });
    expect(projectDisabledApplicationCommands(snapshot).map(({ name }) => name))
      .toEqual(expect.arrayContaining(['browser', 'browser content', 'browser eval', 'browser goto']));
    expect(commandRestrictionsFrom(snapshot)).toMatchObject({
      'browser content': 'application-wide',
      'browser eval': 'application-wide',
      'browser goto': 'application-wide',
    });

    managers.command.dispatch('browser');
    expect(managers.tab.cur().log.at(-1)).toMatchObject({
      input: 'browser', output: 'Command is disabled: browser.',
    });
    await expect(managers.command.dispatchLineWithOutput('janus', 'browser')).resolves.toEqual({
      dispatched: true, output: 'Command is disabled: browser.',
    });
    await expect(managers.command.dispatchQueuedLine('janus', 'browser')).resolves.toEqual({
      dispatched: true, output: 'Command is disabled: browser.',
    });
    const policy = completionPolicy(snapshot);
    expect(policy.allows('browser')).toBe(false);
    expect(policy.allows('browser content')).toBe(false);
    expect(commandNameCandidates(snapshot)).not.toContain('browser');

    await expect(runCommandsTopicAction(managers, {
      topic: 'commands', action: 'set', name: 'browser', setting: 'enabled', value: true,
    })).resolves.toBeUndefined();

    expect(persisted(home)).toHaveProperty('browser', { enabled: true, agentAccess: true });
    expect(projectDisabledApplicationCommands(readCommandsTopic(managers))).toEqual([]);
    const restored = completionPolicy(readCommandsTopic(managers));
    expect(restored.allows('browser')).toBe(true);
    expect(commandNameCandidates(readCommandsTopic(managers))).toContain('browser');
    await expect(managers.command.dispatchLineWithOutput('janus', 'browser')).resolves.toEqual({
      dispatched: true, output: '',
    });
    managers.command.dispatch('browser');
    expect(managers.browser.runInteractive).toHaveBeenCalledTimes(2);
  });

  it('keeps an agent-only restriction out of the human projection and allow-list while extraction still finds it', async () => {
    const { managers } = fixture();

    await expect(runCommandsTopicAction(managers, {
      topic: 'commands', action: 'set', name: 'browser content', setting: 'agentAccess', value: false,
    })).resolves.toBeUndefined();

    const snapshot = readCommandsTopic(managers);
    expect(projectDisabledApplicationCommands(snapshot).map(({ name }) => name))
      .not.toContain('browser content');
    const grants = [...NATIVE_ACP_COMMANDS];
    const allowed = grants.filter((command) => (
      snapshot.commands.find((entry) => entry.name === command)?.effectiveAgentAccess ?? true
    ));
    const tools = createAcpToolTable(grants);
    expect(allowed).not.toContain('browser content');
    const allowLine = toolPrimer(tools, allowed)
      .split('\n').find((line) => line.startsWith('Only these commands are allowed:'));
    expect(allowLine).not.toContain('browser content');
    expect(toolExtractor(tools)('browser content')).toBe('browser content');

    await expect(managers.command.dispatchLineWithOutput('janus', 'browser content')).resolves.toEqual({
      dispatched: true, output: '',
    });
    expect(managers.browser.runInteractive).toHaveBeenCalledWith('browser content', 'janus');
  });
});
