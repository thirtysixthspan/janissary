import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../managers.js';
import { TabManager } from '../tab/manager.js';
import { makeTab } from '../tab/index.js';
import { tabRuntime } from '../tab/runtime.js';
import { seedRootAgentTab } from '../tab/root-agent-test-fixture.js';
import { agentNames } from '../agent/names.js';
import { initWorkspaceDir } from '../workspace/index.js';
import { NO_REPO } from '../workspace/manager.js';
import { PROVISION_FAILURE_CLOSE_DELAY_MS } from '../workspace/provision-wire.js';
import { notify } from '../notifications/index.js';
import type * as Notifications from '../notifications/index.js';
import type * as Sandbox from '../sandbox/index.js';
import {
  TAB_PLUGIN_API_VERSION, type TabPluginDeclaration, type TabPluginLaunchReadyHandler,
  type TabPluginLaunchRequest, type TabPluginLaunchResult, type TabPluginServerCapabilities,
} from './api.js';
import { TabPluginHost } from './host.js';

vi.mock('../notifications/index.js', async (importOriginal) => ({
  ...await importOriginal<typeof Notifications>(),
  notify: vi.fn(),
}));
vi.mock('../sandbox/index.js', async (importOriginal) => ({
  ...await importOriginal<typeof Sandbox>(),
  sandboxNotice: () => 'workspace isolation off: sandbox-exec unavailable',
}));

const manifest: TabPluginDeclaration = {
  id: 'lt', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: 1, tabLabelPrefix: 'shell', fileExtensions: {},
  command: 'ltfixture',
  spawnTerminal: true,
  capabilities: ['launchTab', 'updateTab', 'rejectRequest'],
};

type Clone = { resolve: () => void; reject: (error: Error) => void };

let root: string;
let clones: Map<string, Clone>;
let createAnswer: { error: string } | undefined;

function workspaceStub() {
  return {
    create: vi.fn((name: string) => {
      if (createAnswer) return createAnswer;
      let clone: Clone = { resolve: () => {}, reject: () => {} };
      const ready = new Promise<void>((resolve, reject) => { clone = { resolve, reject }; });
      clones.set(name, clone);
      return { dir: path.join(root, '.janissary', 'workspace', name), ready };
    }),
    preflight: vi.fn(() => createAnswer?.error),
    provisioning: vi.fn(() => false),
    cancel: vi.fn(), retain: vi.fn(), release: vi.fn(), remove: vi.fn(),
  };
}

function makeManagers(seed = true): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers, root);
  if (seed) seedRootAgentTab(managers.tab);
  let spawned = 0;
  Object.assign(managers, {
    workspace: workspaceStub(),
    sessions: { view: () => [] },
    pty: {
      spawn: vi.fn(() => { spawned += 1; return `pty${spawned}`; }),
      adopt: vi.fn(), kill: vi.fn(), closeTab: vi.fn(),
      spawnDimensions: () => ({ cols: 80, rows: 24 }),
      isRunning: () => true,
    },
    plugins: { declarations: [] },
    harness: { closeTab: vi.fn(), registerShellObservers: vi.fn() },
    shell: { closeTab: vi.fn() }, schedule: { closeTab: vi.fn() }, editorAcp: { closeTab: vi.fn() },
    editorWatch: { closeTab: vi.fn() }, fileNavigator: { closeTab: vi.fn() }, acp: { closeTab: vi.fn() },
    browser: { closeTab: vi.fn() }, questions: { closeTab: vi.fn() }, remote: { closeTab: vi.fn() },
    database: { closeTab: vi.fn() }, communication: { closeTab: vi.fn() }, command: { closeTab: vi.fn() },
  });
  return managers;
}

// Launches with a payload naming where the tab started; while provisioning the factory starts nothing,
// otherwise it starts an unconfined terminal there. The ready handler starts the confined one.
const confinedReady: TabPluginLaunchReadyHandler = (event, capabilities) => {
  capabilities.updateTab(event.instanceKey, (resources) => ({
    payload: {
      ptyId: resources.spawnTerminal({ cwd: event.workspaceDir, workspace: { dir: event.workspaceDir } }).ptyId,
      cwd: event.workspaceDir,
    },
  }));
};

function hostFor(
  managers: Managers,
  request: TabPluginLaunchRequest,
  ready: TabPluginLaunchReadyHandler = confinedReady,
): { host: TabPluginHost; results: (TabPluginLaunchResult | undefined)[] } {
  const results: (TabPluginLaunchResult | undefined)[] = [];
  let launched = 0;
  const command = (_argument: string, capabilities: TabPluginServerCapabilities) => {
    launched += 1;
    results.push(capabilities.launchTab(`lt-${launched}`, request, (resources, start) => ({
      title: 'shell',
      payload: start.workspaceDir
        ? { provisioning: true, cwd: start.cwd }
        : { ptyId: resources.spawnTerminal({ cwd: start.cwd }).ptyId, cwd: start.cwd },
    }), ready));
  };
  const host = new TabPluginHost(managers, [manifest], {
    lt: () => Promise.resolve({
      activate: () => ({
        isPayload: () => true,
        intent: () => null,
        opener: { inline: () => {}, external: () => {} },
        command,
      }),
    }),
  });
  return { host, results };
}

function launch(host: TabPluginHost, managers: Managers, argument = ''): Promise<void> {
  const label = managers.tab.tabs[0]?.label ?? 'janus';
  return host.runCommand('lt', `ltfixture ${argument}`, { label, command: `ltfixture ${argument}` });
}

const pluginTabs = (managers: Managers) => managers.tab.tabs.filter((tab) => tab.plugin?.id === 'lt');
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  root = mkdtempSync(path.join(tmpdir(), 'launch-tab-'));
  initWorkspaceDir(root, path.join(root, '.claude.json'));
  clones = new Map();
  createAnswer = undefined;
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('launchTab with a workspace', () => {
  it('places a busy tab owning its clone before the clone lands, starting nothing', async () => {
    const managers = makeManagers();
    const { host, results } = hostFor(managers, { name: 'docs', workspace: { offline: true } });

    await launch(host, managers, 'docs');

    const dir = path.join(root, '.janissary', 'workspace', 'docs');
    const [tab] = pluginTabs(managers);
    expect(results).toEqual([{ label: 'docs' }]);
    expect(tab).toMatchObject({ label: 'docs', title: 'docs', workspaceDir: dir, offline: true });
    expect(tab?.plugin?.busy).toBe(true);
    expect(tab?.plugin?.payload).toEqual({ provisioning: true, cwd: dir });
    expect(managers.tab.cwdOf('docs')).toBe(dir);
    expect(managers.pty.spawn).not.toHaveBeenCalled();
    expect(managers.workspace.retain).not.toHaveBeenCalled();
    host.dispose();
  });

  it('runs the ready handler once the clone lands, which starts the terminal confined to the clone', async () => {
    const managers = makeManagers();
    const ready = vi.fn(confinedReady);
    const { host } = hostFor(managers, { name: 'docs', workspace: { offline: false } }, ready);

    await launch(host, managers, 'docs');
    clones.get('docs')?.resolve();
    await settle();

    const dir = path.join(root, '.janissary', 'workspace', 'docs');
    expect(ready).toHaveBeenCalledWith(expect.objectContaining({
      instanceKey: 'lt-1', workspaceDir: dir, displayDir: managers.tab.shorten(dir),
      sandboxNotice: 'workspace isolation off: sandbox-exec unavailable',
    }), expect.anything());
    const call = vi.mocked(managers.pty.spawn).mock.calls[0];
    expect(call?.[3]).toBe(dir);
    expect(call?.[4]).toBe(dir);
    expect(pluginTabs(managers)[0]?.plugin?.busy).toBe(false);
    expect(host.statusFor('lt')?.state).toBe('active');
    host.dispose();
  });

  it('posts the failure and closes the tab after the delay when the clone fails', async () => {
    const managers = makeManagers();
    const { host } = hostFor(managers, { name: 'docs', workspace: { offline: false } });

    await launch(host, managers, 'docs');
    clones.get('docs')?.reject(new Error('clone exploded'));
    await settle();

    expect(notify).toHaveBeenCalledWith(managers, 'manual', 'janus', 'Failed to create workspace for "docs": clone exploded');
    expect(pluginTabs(managers)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(PROVISION_FAILURE_CLOSE_DELAY_MS);
    expect(pluginTabs(managers)).toHaveLength(0);
    host.dispose();
  });

  it('cancels the clone when the tab closes first and never runs the ready handler', async () => {
    const managers = makeManagers();
    const ready = vi.fn(confinedReady);
    const { host } = hostFor(managers, { name: 'docs', workspace: { offline: false } }, ready);

    await launch(host, managers, 'docs');
    managers.tab.closeTab(managers.tab.findIndex('docs'));
    clones.get('docs')?.resolve();
    await settle();

    expect(managers.workspace.cancel).toHaveBeenCalledWith('docs');
    expect(ready).not.toHaveBeenCalled();
    host.dispose();
  });

  it('closes only its own tab when the ready handler rejects, leaving the plugin enabled', async () => {
    const managers = makeManagers();
    const { host } = hostFor(managers, { workspace: { offline: false } }, (_event, capabilities) => {
      capabilities.rejectRequest('zsh would not start');
    });

    await launch(host, managers);
    await launch(host, managers);
    const [first, second] = pluginTabs(managers).map((tab) => tab.label);
    clones.get(first ?? '')?.resolve();
    await settle();
    await vi.advanceTimersByTimeAsync(PROVISION_FAILURE_CLOSE_DELAY_MS);

    expect(notify).toHaveBeenCalledWith(
      managers, 'manual', 'janus', `Failed to create workspace for "${first}": zsh would not start`,
    );
    expect(pluginTabs(managers).map((tab) => tab.label)).toEqual([second]);
    expect(host.statusFor('lt')?.state).toBe('active');
    host.dispose();
  });

  it('leaves a same-named relaunch open when the failed first launch\'s close delay passes', async () => {
    const managers = makeManagers();
    const { host } = hostFor(managers, { name: 'docs', workspace: { offline: false } });

    await launch(host, managers, 'docs');
    clones.get('docs')?.reject(new Error('clone exploded'));
    await settle();
    managers.tab.closeTab(managers.tab.findIndex('docs'));
    await launch(host, managers, 'docs');
    vi.mocked(managers.workspace.cancel).mockClear();
    await vi.advanceTimersByTimeAsync(PROVISION_FAILURE_CLOSE_DELAY_MS);

    expect(pluginTabs(managers).map((tab) => [tab.label, tab.plugin?.instanceKey])).toEqual([['docs', 'lt-2']]);
    expect(managers.workspace.cancel).not.toHaveBeenCalled();
    host.dispose();
  });

  it('posts nothing for a same-named relaunch when the closed first launch\'s clone rejects late', async () => {
    const managers = makeManagers();
    const { host } = hostFor(managers, { name: 'docs', workspace: { offline: false } });

    await launch(host, managers, 'docs');
    const first = clones.get('docs');
    managers.tab.closeTab(managers.tab.findIndex('docs'));
    await launch(host, managers, 'docs');
    first?.reject(new Error('clone cancelled'));
    await settle();
    await vi.advanceTimersByTimeAsync(PROVISION_FAILURE_CLOSE_DELAY_MS);

    expect(notify).not.toHaveBeenCalledWith(managers, 'manual', 'janus', expect.stringContaining('Failed to create workspace'));
    expect(pluginTabs(managers).map((tab) => [tab.label, tab.plugin?.instanceKey])).toEqual([['docs', 'lt-2']]);
    host.dispose();
  });

  it('disables the plugin when the ready handler throws', async () => {
    const managers = makeManagers();
    const { host } = hostFor(managers, { name: 'docs', workspace: { offline: false } }, () => {
      throw new Error('ready handler broke');
    });

    await launch(host, managers, 'docs');
    clones.get('docs')?.resolve();
    await settle();

    expect(host.statusFor('lt')).toMatchObject({ state: 'disabled' });
    expect(pluginTabs(managers)).toHaveLength(0);
    host.dispose();
  });
});

describe('launchTab without a clone', () => {
  it('falls back to an unconfined tab in the issuing directory when there is no repository', async () => {
    const managers = makeManagers();
    tabRuntime(managers.tab.tabs[0]!).cwd = path.join(root, 'src');
    createAnswer = { error: NO_REPO };
    const { host, results } = hostFor(managers, { workspace: { offline: false } });

    await launch(host, managers);

    const [tab] = pluginTabs(managers);
    expect(results).toEqual([{ label: tab?.label, fallbackReason: 'no git repository found' }]);
    expect(tab?.workspaceDir).toBeUndefined();
    expect(vi.mocked(managers.pty.spawn).mock.calls[0]?.[3]).toBe(path.join(root, 'src'));
    expect(vi.mocked(managers.pty.spawn).mock.calls[0]?.[4]).toBeUndefined();
    host.dispose();
  });

  it('names the origin reason and starts at the checkout root from a workspaced tab', async () => {
    const managers = makeManagers();
    const issuing = managers.tab.tabs[0]!;
    issuing.workspaceDir = path.join(root, '.janissary', 'workspace', 'worker');
    tabRuntime(issuing).cwd = issuing.workspaceDir;
    createAnswer = { error: 'Failed to create workspace: fatal: No such remote' };
    const { host, results } = hostFor(managers, { workspace: { offline: false } });

    await launch(host, managers);

    expect(results[0]?.fallbackReason).toBe('the repository has no "origin" remote');
    expect(vi.mocked(managers.pty.spawn).mock.calls[0]?.[3]).toBe(root);
    expect(managers.workspace.retain).not.toHaveBeenCalled();
    host.dispose();
  });

  it('returns nothing and opens nothing when a typed name clashes with an open tab', async () => {
    const managers = makeManagers();
    const { host, results } = hostFor(managers, { name: 'janus' });

    await launch(host, managers, 'janus');

    expect(results).toEqual([undefined]);
    expect(pluginTabs(managers)).toHaveLength(0);
    expect(notify).toHaveBeenCalledWith(managers, 'launch-refused', 'janus', expect.any(String));
    host.dispose();
  });

  it('keeps the launch label for a launch origin', async () => {
    const managers = makeManagers(false);
    const { host, results } = hostFor(managers, {});

    await host.runCommand('lt', 'ltfixture', { label: 'janus', command: 'ltfixture', launch: true });

    expect(results).toEqual([{ label: 'janus' }]);
    expect(managers.tab.tabs.map((tab) => tab.label)).toEqual(['janus']);
    expect(vi.mocked(managers.pty.spawn).mock.calls[0]?.[3]).toBe(root);
    host.dispose();
  });

  it('names the tab from the prefix once every pool name is held', async () => {
    const managers = makeManagers();
    managers.tab.tabs.push(...agentNames.map((name, index) => makeTab(name, '#abc', index + 2)));
    const { host, results } = hostFor(managers, {});

    await launch(host, managers);
    await launch(host, managers);

    expect(results.map((result) => result?.label)).toEqual(['shell', 'shell-2']);
    host.dispose();
  });
});
