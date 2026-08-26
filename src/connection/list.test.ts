import { describe, it, expect, vi } from 'vitest';
import { listLines, listCompletionConnections } from './list.js';
import { ConnectionManager } from './manager.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

function makeManagers(tabs: Tab[], terminals: string[] = []): Managers {
  return {
    shell: { has: vi.fn(() => false) },
    acp: { has: vi.fn(() => false), label: vi.fn() },
    monitor: { connectionsFor: vi.fn(() => []) },
    editorAcp: { connectionsFor: vi.fn(() => []) },
    browser: { info: vi.fn() },
    pty: { terminalsFor: vi.fn(() => terminals) },
    database: { listOpen: vi.fn(() => []), openDbs: vi.fn(() => []) },
    tab: { tabs, shorten: (p: string) => p, cwdOf: () => '/repo' },
  } as unknown as Managers;
}

function remoteTab(label = 'claude'): Tab {
  const tab = makeTab(label, 'red');
  tab.remote = { address: 'admin@devbox:/srv/proj', host: 'devbox' };
  return tab;
}

// A remote tab shows both rows: `ssh:` for the transport it runs over, and `terminal:` for the
// process on the far side — each visible and separately closable. The ssh session itself is never
// listed as `terminal:ssh`, which is why the transport PTY is marked as such in the registry.
describe('connection list for a remote tab', () => {
  it('lists both the transport and the remote process', () => {
    const managers = makeManagers([remoteTab()], ['claude']);
    expect(listLines(managers, 'claude')).toEqual(['terminal:claude', 'ssh:admin@devbox:/srv/proj']);
  });

  it('reports the remote binary\'s name, not ssh', () => {
    const managers = makeManagers([remoteTab()], ['claude']);
    expect(listLines(managers, 'claude')).not.toContain('terminal:ssh');
  });

  it('offers the tab\'s label for ssh: completion', () => {
    const managers = makeManagers([remoteTab()], ['claude']);
    expect(listCompletionConnections(managers, 'claude')).toContain('ssh:claude');
  });

  it('puts both rows in the tab\'s own connections panel', () => {
    const managers = makeManagers([remoteTab()], ['claude']);
    const rows = new ConnectionManager(managers).connectionsFor('claude');
    expect(rows).toEqual([
      { text: 'ssh:admin@devbox:/srv/proj', kind: 'ssh' },
      { text: 'terminal:claude', kind: 'terminal' },
    ]);
  });

  it('leaves an ordinary tab with only its terminal row', () => {
    const managers = makeManagers([makeTab('claude', 'red')], ['claude']);
    expect(listLines(managers, 'claude')).toEqual(['terminal:claude']);
    expect(new ConnectionManager(managers).connectionsFor('claude')).toEqual([
      { text: 'terminal:claude', kind: 'terminal' },
    ]);
  });

  // An ssh tab keeps its existing behavior: its only PTY *is* the connection, so no terminal row.
  it('leaves an ssh tab showing its destination alone', () => {
    const tab = makeTab('bastion', 'red');
    tab.harness = { name: 'ssh', program: 'ssh', ptyId: 'pty-1', status: 'running', destination: 'host' };
    const managers = makeManagers([tab], ['ssh']);
    expect(new ConnectionManager(managers).connectionsFor('bastion')).toEqual([
      { text: 'ssh:host', kind: 'ssh' },
    ]);
  });
});
