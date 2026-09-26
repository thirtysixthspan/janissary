import { describe, it, expect, vi } from 'vitest';
import { connectionCatalog } from './catalog.js';
import { ConnectionManager } from './manager.js';
import { SHELL_NAME } from '../shell/manager.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

function remoteTab(label: string): Tab {
  const tab = makeTab(label, 'red');
  tab.remote = { address: 'admin@devbox:/srv/proj', host: 'devbox' };
  return tab;
}

function sshTab(label: string, destination: string, ptyId: string): Tab {
  const tab = makeTab(label, 'blue');
  tab.harness = { name: 'ssh', program: 'ssh', ptyId, status: 'running', destination };
  return tab;
}

// A tab holding one of every kind of connection, beside an ssh tab and a database only another tab
// opened. Every close mock succeeds only for the exact name it owns, so a close routed to the wrong
// owner shows up as a `No open connection` reply.
function populated(): Managers {
  const tabs = [remoteTab('main'), sshTab('bastion', 'host.example.com', 'pty-9')];
  return {
    shell: { has: vi.fn(() => true), close: vi.fn((label: string) => label === 'main') },
    acp: { has: vi.fn(() => true), label: vi.fn(() => 'anthropic/claude-sonnet'), close: vi.fn((label: string) => label === 'main') },
    monitor: {
      connectionsFor: vi.fn(() => [{ text: 'monitor:security (opencode/x)', kind: 'acp', acpRef: { scope: 'monitor', name: 'security' } }]),
      stop: vi.fn((owner: string, name: string) => owner === 'main' && name === 'security'),
    },
    editorAcp: {
      connectionsFor: vi.fn(() => [{ text: 'reviewer (acp)', kind: 'acp', acpRef: { scope: 'editor', label: 'main', persona: 'reviewer' } }]),
      close: vi.fn((label: string, persona: string) => label === 'main' && persona === 'reviewer'),
    },
    browser: { info: vi.fn(() => ({ ids: ['w1'], mode: 'headless' })), run: vi.fn(() => Promise.resolve('Closed connection browser:w1.')) },
    pty: {
      terminalsFor: vi.fn((label: string) => (label === 'main' ? ['claude'] : ['ssh'])),
      killTerminal: vi.fn((label: string, program: string) => label === 'main' && program === 'claude'),
      kill: vi.fn(),
    },
    remote: { close: vi.fn((label: string) => label === 'main') },
    database: { openDbs: vi.fn(() => ['mine']), listOpen: vi.fn(() => ['mine', 'shared']), close: vi.fn(() => true) },
    tab: {
      tabs,
      byLabel: (label: string) => tabs.find((t) => t.label === label),
      shorten: (p: string) => p,
      cwdOf: () => '/repo',
      append: vi.fn(),
      startRunning: vi.fn(),
      finishRunning: vi.fn(),
    },
  } as unknown as Managers;
}

describe('connectionCatalog', () => {
  it('lists the tab\'s own connections first, then those only the app-wide list reaches', () => {
    const entries = connectionCatalog(populated(), 'main');

    expect(entries.map((e) => [`${e.kind}:${e.id}`, e.scope])).toEqual([
      [`shell:${SHELL_NAME}`, 'tab'],
      ['acp:anthropic/claude-sonnet', 'tab'],
      ['acp:security', 'tab'],
      ['acp:reviewer', 'tab'],
      ['browser:w1', 'tab'],
      ['ssh:main', 'tab'],
      ['terminal:claude', 'tab'],
      ['sqlite:mine', 'tab'],
      ['ssh:bastion', 'global'],
      ['sqlite:shared', 'global'],
    ]);
  });

  it('keeps the panel text apart from the name close accepts', () => {
    const entries = connectionCatalog(populated(), 'main');

    expect(entries.find((e) => e.kind === 'shell')?.display).toBe(`${SHELL_NAME}:/repo`);
    expect(entries.find((e) => e.kind === 'browser')?.display).toBe('browser:w1 (headless)');
    expect(entries.find((e) => e.id === 'bastion')).toMatchObject({ display: 'ssh:host.example.com', detail: 'host.example.com' });
    expect(entries.find((e) => e.id === 'reviewer')).toMatchObject({ display: 'reviewer (acp)', acpRef: { scope: 'editor', label: 'main', persona: 'reviewer' } });
  });

  it('gives an ssh tab its ssh entry and no terminal entry for the ssh session itself', () => {
    const entries = connectionCatalog(populated(), 'bastion').filter((e) => e.scope === 'tab');

    expect(entries.map((e) => `${e.kind}:${e.id}`)).toContain('ssh:bastion');
    expect(entries.some((e) => e.kind === 'terminal')).toBe(false);
  });

  it('leaves out an agent session whose handshake has not named it yet', () => {
    const managers = populated();
    vi.mocked(managers.acp.label).mockReturnValue(undefined);

    expect(connectionCatalog(managers, 'main').some((e) => e.acpRef?.scope === 'tab')).toBe(false);
  });
});

// Every name the catalog hands out — and so every name the panel, `connection list`, and completion
// offer — must parse as a `connection close` target and close exactly that connection.
describe('every catalog entry round-trips through connection close', () => {
  const entries = connectionCatalog(populated(), 'main');

  it.each(entries.map((e) => [`${e.kind}:${e.id}`, e.kind]))('closes %s', async (target, kind) => {
    const managers = populated();
    const command = `connection close ${target}`;

    new ConnectionManager(managers).run(command, 'main');
    await Promise.resolve();
    await Promise.resolve();

    if (kind === 'browser') {
      expect(managers.browser.run).toHaveBeenCalledWith('main', `browser window close ${target.slice('browser:'.length)}`);
      expect(managers.tab.finishRunning).toHaveBeenCalledWith('main', `Closed connection ${target}.`, { command });
    } else {
      expect(managers.tab.append).toHaveBeenCalledWith('main', { input: command, output: `Closed connection ${target}.` });
    }
  });

  it('covers every kind the catalog produces', () => {
    expect(new Set(entries.map((e) => e.kind))).toEqual(new Set(['shell', 'acp', 'browser', 'ssh', 'terminal', 'sqlite']));
  });
});
