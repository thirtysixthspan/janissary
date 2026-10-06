import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { TabManager } from '../tab/manager.js';
import { TAB_PLUGIN_API_VERSION, type TabPluginDeclaration } from './api.js';
import { TabPluginHost } from './host.js';
import { seedRootAgentTab } from '../tab/root-agent-test-fixture.js';

// A terminal-owning plugin whose command opens one tab per call, starting its terminal wherever the
// command's argument says. The directory is the plugin's to choose; whether a process may start
// there is the host's, and a refusal must answer that one request without disabling the plugin.
const manifest: TabPluginDeclaration = {
  id: 'term', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: 1, tabLabelPrefix: 'term', fileExtensions: {},
  command: 'termfixture',
  spawnTerminal: true,
  capabilities: ['openOrFocusTab'],
};

function makeManagers(spawn: (cwd: string) => string): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers, '/repo');
  seedRootAgentTab(managers.tab);
  Object.assign(managers, {
    pty: {
      spawn: vi.fn((_label: string, _program: string, _command: string, cwd: string) => spawn(cwd)),
      adopt: vi.fn(),
      kill: vi.fn(),
      closeTab: vi.fn(),
      spawnDimensions: () => ({ cols: 80, rows: 24 }),
      isRunning: () => true,
    },
    workspace: { retain: vi.fn(), release: vi.fn(), remove: vi.fn(), cancel: vi.fn() },
    // A plugin that started no terminal has nothing to record, but the host asks the declaration
    // anyway — for every terminal a factory adopted, recorded or not — so it has to be answerable.
    plugins: { declarations: [] as { id: string; recordsTerminal?: boolean }[] },
    harness: { registerShellObservers: vi.fn() },
  } as unknown as Managers);
  return managers;
}

function hostFor(managers: Managers): TabPluginHost {
  let opened = 0;
  return new TabPluginHost(managers, [manifest], {
    term: () => Promise.resolve({
      activate: () => ({
        isPayload: () => true,
        intent: () => null,
        opener: { inline: () => {}, external: () => {} },
        command: (cwd, capabilities) => {
          opened += 1;
          capabilities.openOrFocusTab(`term-${opened}`, (resources) => ({
            title: 'term',
            payload: { ptyId: resources.spawnTerminal({ cwd, shell: '/bin/zsh', args: [] }).ptyId },
          }));
        },
      }),
    }),
  });
}

function pluginTabs(managers: Managers) {
  return managers.tab.tabs.filter((tab) => tab.plugin?.id === 'term');
}

async function openIn(host: TabPluginHost, managers: Managers, cwd: string): Promise<void> {
  await host.runCommand('term', `termfixture ${cwd}`, { label: managers.tab.tabs[0].label, command: `termfixture ${cwd}` });
}

describe('a refused plugin terminal', () => {
  it('answers the request in the issuing tab and leaves the plugin and its other tabs running', async () => {
    let spawned = 0;
    const managers = makeManagers(() => { spawned += 1; return `pty${spawned}`; });
    const host = hostFor(managers);
    const origin = managers.tab.tabs[0].label;

    await openIn(host, managers, '/repo/src');
    await openIn(host, managers, '/repo/a/../../etc');

    expect(host.statusFor('term')?.state).toBe('active');
    expect(pluginTabs(managers)).toHaveLength(1);
    expect(managers.pty.spawn).toHaveBeenCalledTimes(1);
    expect(managers.pty.kill).not.toHaveBeenCalled();
    expect(managers.tab.byLabel(origin)?.log.at(-1)).toMatchObject({
      input: 'termfixture /repo/a/../../etc',
      output: 'Cannot start a terminal in /repo/a/../../etc: it is outside the project root /repo.',
    });
    host.dispose();
  });

  it('answers a terminal that fails to start the same way', async () => {
    const managers = makeManagers((cwd) => {
      if (cwd === '/repo/gone') throw new Error('chdir failed');
      return 'pty1';
    });
    const host = hostFor(managers);
    const origin = managers.tab.tabs[0].label;

    await openIn(host, managers, '/repo/src');
    await openIn(host, managers, '/repo/gone');

    expect(host.statusFor('term')?.state).toBe('active');
    expect(pluginTabs(managers)).toHaveLength(1);
    expect(managers.tab.byLabel(origin)?.log.at(-1)?.output).toBe('Cannot start a terminal in /repo/gone: chdir failed.');
    host.dispose();
  });
});
