import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type * as nodeOs from 'node:os';
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
import { createAcpToolTable, gateCommand, toolExtractor, toolPrimer } from '../acp/tool-table.js';
import type { AcpRunSnapshot } from '../acp/types.js';
import { command as subagentCommand } from '../commands/subagent.js';
import * as fileGrepCandidates from '../file-grep/candidates.js';
import * as fileGrepScan from '../file-grep/scan.js';

const homeDir = vi.hoisted(() => ({ dir: '' }));

vi.mock('node:os', async (importOriginal) => ({
  ...await importOriginal<typeof nodeOs>(),
  homedir: vi.fn(() => homeDir.dir),
}));

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
  vi.restoreAllMocks();
});

function fixture(): {
  home: string; root: string; workspace: string; managers: Managers; settings: NativeCommandSettingsManager;
} {
  const base = mkdtempSync(path.join(os.tmpdir(), 'native-command-feature-'));
  roots.push(base);
  const root = path.join(base, 'project');
  const home = path.join(base, 'home');
  const workspace = path.join(base, 'workspace');
  mkdirSync(root);
  mkdirSync(home);
  mkdirSync(workspace);
  homeDir.dir = home;
  const settings = new NativeCommandSettingsManager(root, home);
  const managers = {} as Managers;
  managers.tab = new TabManager(managers, root);
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
  return { home, root, workspace, managers, settings };
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
    expect(toolExtractor(tools)('```janissary\nbrowser content\n```'))
      .toMatchObject({ kind: 'batch', commands: [expect.objectContaining({ command: 'browser content' })] });

    await expect(managers.command.dispatchLineWithOutput('janus', 'browser content')).resolves.toEqual({
      dispatched: true, output: '',
    });
    expect(managers.browser.runInteractive).toHaveBeenCalledWith('browser content', 'janus');
  });

  it('persists, projects, restricts, and restores a disabled grep child', async () => {
    const { home, managers } = fixture();

    await expect(runCommandsTopicAction(managers, {
      topic: 'commands', action: 'set', name: 'file grep', setting: 'enabled', value: false,
    })).resolves.toBeUndefined();

    expect(persisted(home)).toHaveProperty('file grep', { enabled: false, agentAccess: true });
    const snapshot = readCommandsTopic(managers);
    expect(snapshot.commands.find(({ name }) => name === 'file grep')).toMatchObject({
      name: 'file grep', kind: 'native', aliases: [], forms: ['file grep'], parent: 'file', nativeTool: 'file',
      enabled: false, agentAccess: true, effectiveEnabled: false,
    });
    expect(projectDisabledApplicationCommands(snapshot).map(({ name }) => name)).toContain('file grep');
    expect(commandRestrictionsFrom(snapshot)).toMatchObject({ 'file grep': 'application-wide' });
    await expect(managers.command.dispatchLineWithOutput('janus', 'file grep --literal TODO')).resolves.toEqual({
      dispatched: true, output: 'Command is disabled: file grep.',
    });

    await expect(runCommandsTopicAction(managers, {
      topic: 'commands', action: 'set', name: 'file grep', setting: 'enabled', value: true,
    })).resolves.toBeUndefined();

    expect(persisted(home)).toHaveProperty('file grep', { enabled: true, agentAccess: true });
    const restored = readCommandsTopic(managers);
    expect(restored.commands.find(({ name }) => name === 'file grep'))
      .toMatchObject({ effectiveEnabled: true, effectiveAgentAccess: true });
    expect(projectDisabledApplicationCommands(restored).map(({ name }) => name)).not.toContain('file grep');
    expect(commandRestrictionsFrom(restored)).not.toHaveProperty('file grep');
  });

  it('keeps an agent-only grep restriction out of the human projection', async () => {
    const { home, managers } = fixture();

    await expect(runCommandsTopicAction(managers, {
      topic: 'commands', action: 'set', name: 'file grep', setting: 'agentAccess', value: false,
    })).resolves.toBeUndefined();

    expect(persisted(home)).toHaveProperty('file grep', { enabled: true, agentAccess: false });
    const snapshot = readCommandsTopic(managers);
    expect(snapshot.commands.find(({ name }) => name === 'file grep')).toMatchObject({
      name: 'file grep', kind: 'native', forms: ['file grep'], enabled: true, agentAccess: false,
      effectiveEnabled: true, effectiveAgentAccess: false,
    });
    expect(projectDisabledApplicationCommands(snapshot).map(({ name }) => name)).not.toContain('file grep');
    expect(commandRestrictionsFrom(snapshot)).toMatchObject({ 'file grep': 'agents' });
  });

  const COMMAND = 'file grep --literal needle   here';
  const ROW = 'notes.md:1: needle   here';

  function staged() {
    const staged = fixture();
    staged.managers.tab.cur().workspaceDir = staged.workspace;
    writeFileSync(path.join(staged.workspace, 'notes.md'), 'needle   here\nother line\n');
    writeFileSync(path.join(staged.root, 'notes.md'), 'project needle   here\n');
    return staged;
  }

  it('runs the default grep against the tab workspace and records one typed entry', async () => {
    const { managers } = staged();

    managers.command.dispatch(COMMAND);

    await vi.waitFor(() => expect(managers.tab.cur().log).toHaveLength(1));
    expect(managers.tab.cur().log[0]).toMatchObject({ input: COMMAND, output: ROW });
    expect(managers.tab.cur().log[0]?.output).not.toContain('project');
    expect(managers.tab.cur().cmdHistory).toEqual([COMMAND]);
  });

  it('prints the exact disabled line without starting workspace or content work', async () => {
    const { managers } = staged();
    await expect(runCommandsTopicAction(managers, {
      topic: 'commands', action: 'set', name: 'file grep', setting: 'enabled', value: false,
    })).resolves.toBeUndefined();
    const discover = vi.spyOn(fileGrepCandidates, 'discoverGrepCandidates');
    const scan = vi.spyOn(fileGrepScan, 'scanFiles');
    try {
      managers.command.dispatch(COMMAND);

      await vi.waitFor(() => expect(managers.tab.cur().log).toHaveLength(1));
      expect(managers.tab.cur().log[0]).toMatchObject({
        input: COMMAND, output: 'Command is disabled: file grep.',
      });
      expect(discover).not.toHaveBeenCalled();
      expect(scan).not.toHaveBeenCalled();
      expect(managers.tab.cur().cmdHistory).toEqual([COMMAND]);
    } finally {
      discover.mockRestore();
      scan.mockRestore();
    }
  });

  it('still runs a typed grep for the human when only agent access is off', async () => {
    const { home, managers } = staged();
    await expect(runCommandsTopicAction(managers, {
      topic: 'commands', action: 'set', name: 'file grep', setting: 'agentAccess', value: false,
    })).resolves.toBeUndefined();

    managers.command.dispatch(COMMAND);

    await vi.waitFor(() => expect(managers.tab.cur().log).toHaveLength(1));
    expect(managers.tab.cur().log[0]).toMatchObject({ input: COMMAND, output: ROW });
    expect(persisted(home)).toHaveProperty('file grep', { enabled: true, agentAccess: false });
    expect(commandRestrictionsFrom(readCommandsTopic(managers))).toMatchObject({ 'file grep': 'agents' });
    expect(managers.tab.cur().cmdHistory).toEqual([COMMAND]);
  });

  it('refuses an enabled child while its disabled file parent suppresses the run', async () => {
    const { home, managers } = staged();
    await expect(runCommandsTopicAction(managers, {
      topic: 'commands', action: 'set', name: 'file grep', setting: 'enabled', value: true,
    })).resolves.toBeUndefined();
    await expect(runCommandsTopicAction(managers, {
      topic: 'commands', action: 'set', name: 'file', setting: 'enabled', value: false,
    })).resolves.toBeUndefined();
    expect(persisted(home)).toHaveProperty('file grep', { enabled: true, agentAccess: true });
    expect(persisted(home)).toHaveProperty('file', { enabled: false, agentAccess: true });
    const discover = vi.spyOn(fileGrepCandidates, 'discoverGrepCandidates');
    const scan = vi.spyOn(fileGrepScan, 'scanFiles');
    try {
      managers.command.dispatch(COMMAND);

      await vi.waitFor(() => expect(managers.tab.cur().log).toHaveLength(1));
      expect(managers.tab.cur().log[0]).toMatchObject({
        input: COMMAND, output: 'Command is disabled: file grep.',
      });
      expect(discover).not.toHaveBeenCalled();
      expect(scan).not.toHaveBeenCalled();
      expect(managers.tab.cur().cmdHistory).toEqual([COMMAND]);
    } finally {
      discover.mockRestore();
      scan.mockRestore();
    }
  });
});

describe('subagent native settings and typed dispatch', () => {
  const INPUT = 'subagent --role research --task t.md';
  const RECEIPT = {
    replyId: 'reply-1', kind: 'record' as const, recordId: 'record-1', name: 'subagent:Research',
  };

  function granting() {
    const seam = fixture();
    const tab = seam.managers.tab.byLabel('janus')!;
    tab.view = 'plugin';
    (tab as unknown as { plugin: { id: string } }).plugin = { id: 'shell' };
    seam.managers.plugins = {
      declarations: [{ id: 'shell', capabilities: ['promptAcp'] }],
    } as unknown as Managers['plugins'];
    return seam;
  }

  async function set(managers: Managers, setting: 'enabled' | 'agentAccess', value: boolean) {
    await expect(runCommandsTopicAction(managers, {
      topic: 'commands', action: 'set', name: 'subagent', setting, value,
    })).resolves.toBeUndefined();
  }

  it('persists Enabled off under subagent and refuses typed dispatch before run', async () => {
    const { home, managers } = granting();
    await set(managers, 'enabled', false);

    expect(persisted(home)).toHaveProperty('subagent', { enabled: false, agentAccess: true });
    const snapshot = readCommandsTopic(managers);
    const row = snapshot.commands.find(({ name }) => name === 'subagent');
    expect(row).toMatchObject({
      name: 'subagent', kind: 'native', aliases: [], forms: ['subagent'], nativeTool: 'subagent',
      enabled: false, agentAccess: true, effectiveEnabled: false,
    });
    expect(row).not.toHaveProperty('parent');
    expect(projectDisabledApplicationCommands(snapshot).map(({ name }) => name)).toContain('subagent');
    expect(commandRestrictionsFrom(snapshot)).toMatchObject({ subagent: 'application-wide' });

    const run = vi.spyOn(subagentCommand, 'run');
    await expect(managers.command.dispatchLineWithOutput('janus', INPUT)).resolves.toEqual({
      dispatched: true, output: 'Command is disabled: subagent.',
    });
    expect(run).not.toHaveBeenCalled();
    expect(managers.tab.cur().log.at(-1)).toEqual({
      input: INPUT, output: 'Command is disabled: subagent.',
    });
  });

  it('persists Agent access off under subagent and agrees with restriction and gate', async () => {
    const { home, managers } = granting();
    await set(managers, 'agentAccess', false);

    expect(persisted(home)).toHaveProperty('subagent', { enabled: true, agentAccess: false });
    const snapshot = readCommandsTopic(managers);
    expect(snapshot.commands.find(({ name }) => name === 'subagent')).toMatchObject({
      name: 'subagent', kind: 'native', forms: ['subagent'], effectiveEnabled: true,
      effectiveAgentAccess: false,
    });
    expect(projectDisabledApplicationCommands(snapshot).map(({ name }) => name)).not.toContain('subagent');
    expect(commandRestrictionsFrom(snapshot)).toMatchObject({ subagent: 'agents' });
    const gateSnapshot: AcpRunSnapshot = {
      kind: 'core', role: 'tell', roleName: 'writer', grants: ['subagent'],
      rows: [{ name: 'subagent', effectiveEnabled: true, effectiveAgentAccess: false }],
      withoutTools: false,
    };
    expect(gateCommand(gateSnapshot, createAcpToolTable(['subagent']), INPUT)).toStrictEqual({
      refusal: 'Command is disabled: subagent.', refused: 'disabled',
    });
  });

  it('still runs a typed subagent for the human when only Agent access is off', async () => {
    const { managers } = granting();
    await set(managers, 'agentAccess', false);
    const run = vi.spyOn(subagentCommand, 'run').mockReturnValue(RECEIPT);

    await expect(managers.command.dispatchLineWithOutput('janus', INPUT)).resolves.toEqual({
      dispatched: true, output: '', coreResponse: true, result: RECEIPT,
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(managers.tab.cur().log.at(-1)).not.toEqual({
      input: INPUT, output: 'Command is disabled: subagent.',
    });
  });

  it('restores the one subagent settings row without duplicating it', async () => {
    const { home, managers } = granting();
    await set(managers, 'enabled', false);
    await set(managers, 'enabled', true);

    expect(persisted(home)).toHaveProperty('subagent', { enabled: true, agentAccess: true });
    const rows = readCommandsTopic(managers).commands.filter(({ name }) => name === 'subagent');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ effectiveEnabled: true, effectiveAgentAccess: true });
  });
});
