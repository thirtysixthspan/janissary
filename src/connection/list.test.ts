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
    tab: { tabs, byLabel: (label: string) => tabs.find((t) => t.label === label), shorten: (p: string) => p, cwdOf: () => '/repo' },
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
  it('lists both the transport, by the label close accepts, and the remote process', () => {
    const managers = makeManagers([remoteTab()], ['claude']);
    expect(listLines(managers, 'claude')).toEqual(['ssh:claude (admin@devbox:/srv/proj)', 'terminal:claude']);
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

describe('connection list and completion names', () => {
  function populated(): Managers {
    const managers = makeManagers([makeTab('main', 'red')], ['vim']);
    Object.assign(managers.acp, { has: vi.fn(() => true), label: vi.fn(() => 'anthropic/claude-sonnet') });
    Object.assign(managers.monitor, { connectionsFor: vi.fn(() => [{ text: 'monitor:security (opencode/x)', kind: 'acp', acpRef: { scope: 'monitor', name: 'security' } }]) });
    Object.assign(managers.editorAcp, { connectionsFor: vi.fn(() => [{ text: 'reviewer (acp)', kind: 'acp', acpRef: { scope: 'editor', label: 'main', persona: 'reviewer' } }]) });
    return managers;
  }

  it('names the tab\'s agent by its real session name, not a fixed one', () => {
    const managers = populated();
    expect(listLines(managers, 'main')).toContain('acp:anthropic/claude-sonnet');
    expect(listLines(managers, 'main')).not.toContain('acp:opencode');
    expect(listCompletionConnections(managers, 'main')).toContain('acp:anthropic/claude-sonnet');
  });

  it('lists and completes the monitor and persona connections the panel shows', () => {
    const managers = populated();
    expect(listLines(managers, 'main')).toEqual(expect.arrayContaining(['acp:security', 'acp:reviewer']));
    expect(listCompletionConnections(managers, 'main')).toEqual(expect.arrayContaining(['acp:security', 'acp:reviewer']));
  });

  it('completes the terminal connections the list shows', () => {
    const managers = populated();
    expect(listCompletionConnections(managers, 'main')).toContain('terminal:vim');
  });

  it('gives the list and completion the same names when no row carries a detail', () => {
    const managers = populated();
    expect(listLines(managers, 'main')).toEqual(listCompletionConnections(managers, 'main'));
  });
});
