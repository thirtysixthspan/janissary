import { afterAll, describe, it, expect, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { connectionCatalog } from './catalog.js';
import { ConnectionManager } from './manager.js';
import { SHELL_NAME } from '../shell/manager.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

const notifications = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../notifications/index.js', () => ({ notify: notifications.notify }));

const ROOT = mkdtempSync(path.join(tmpdir(), 'janus-catalog-'));
mkdirSync(path.join(ROOT, '.janissary'), { recursive: true });
writeFileSync(path.join(ROOT, '.janissary', 'roles.json'), JSON.stringify({
  ask: { description: 'Questions.', entries: [] },
  tell: { description: 'Tasks.', entries: [] },
  'review-bot': { description: 'Reviews.', entries: [{ harness: 'opencode', model: 'opencode/review' }] },
}));
afterAll(() => { rmSync(ROOT, { recursive: true, force: true }); });

const MODELS: Record<string, string> = {
  ask: 'anthropic/claude-sonnet', tell: 'opencode/tell', 'review-bot': 'opencode/review',
};

function remoteTab(label: string): Tab {
  const tab = makeTab(label, 'red');
  tab.remote = { address: 'admin@devbox:/srv/proj', host: 'devbox' };
  return tab;
}

function sshTab(label: string, destination: string, ptyId: string, hostName?: string): Tab {
  const tab = makeTab(label, 'blue');
  tab.harness = { name: 'ssh', program: 'ssh', ptyId, status: 'running', destination, ...(hostName !== undefined && { hostName }) };
  return tab;
}

// A tab holding one of every kind of connection, beside an ssh tab and a database only another tab
// opened. Every close mock succeeds only for the exact name it owns, so a close routed to the wrong
// owner shows up as a `No open connection` reply.
function populated(): Managers {
  const tabs = [remoteTab('main'), sshTab('bastion', 'host.example.com', 'pty-9')];
  return {
    shell: { has: vi.fn(() => true), close: vi.fn((label: string) => label === 'main') },
    acp: {
      has: vi.fn(() => true),
      label: vi.fn((_label: string, role = 'ask') => MODELS[role]),
      close: vi.fn((label: string) => label === 'main'),
    },
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
      launchDir: ROOT,
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
      ['acp:ask:anthropic/claude-sonnet', 'tab'],
      ['acp:tell:opencode/tell', 'tab'],
      ['acp:review-bot:opencode/review', 'tab'],
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
    expect(entries.find((e) => e.id === 'ask:anthropic/claude-sonnet')).toMatchObject({
      display: 'acp:ask:anthropic/claude-sonnet', acpRef: { scope: 'tab', label: 'main', role: 'ask' },
    });
    expect(entries.find((e) => e.id === 'tell:opencode/tell')).toMatchObject({
      display: 'acp:tell:opencode/tell', acpRef: { scope: 'tab', label: 'main', role: 'tell' },
    });
    expect(entries.find((e) => e.id === 'review-bot:opencode/review')).toMatchObject({
      display: 'acp:review-bot:opencode/review', acpRef: { scope: 'tab', label: 'main', role: 'review-bot' },
    });
    expect(entries.find((e) => e.kind === 'browser')?.display).toBe('browser:w1 (headless)');
    expect(entries.find((e) => e.id === 'bastion')).toMatchObject({ display: 'ssh:host.example.com', detail: 'host.example.com' });
    expect(entries.find((e) => e.id === 'reviewer')).toMatchObject({ display: 'reviewer (acp)', acpRef: { scope: 'editor', label: 'main', persona: 'reviewer' } });
  });

  it('gives an ssh tab its ssh entry and no terminal entry for the ssh session itself', () => {
    const entries = connectionCatalog(populated(), 'bastion').filter((e) => e.scope === 'tab');

    expect(entries.map((e) => `${e.kind}:${e.id}`)).toContain('ssh:bastion');
    expect(entries.some((e) => e.kind === 'terminal')).toBe(false);
  });

  it('shows the saved host name in an ssh tab\'s own panel while keeping the real destination for close and list', () => {
    const tabs = [sshTab('thecandykingdom', 'anonymouscoward@10.27.1.94', 'pty-s', 'thecandykingdom')];
    const managers = { ...populated(), tab: { ...populated().tab, tabs, byLabel: (l: string) => tabs.find((t) => t.label === l) } } as unknown as Managers;

    const own = connectionCatalog(managers, 'thecandykingdom').find((e) => e.kind === 'ssh');

    expect(own).toMatchObject({ id: 'thecandykingdom', display: 'ssh:thecandykingdom', detail: 'anonymouscoward@10.27.1.94', scope: 'tab' });
  });

  it('shows another tab\'s saved-host connection by its saved name with global scope', () => {
    const tabs = [makeTab('main', 'red'), sshTab('thecandykingdom', 'anonymouscoward@10.27.1.94', 'pty-s', 'thecandykingdom')];
    const managers = { ...populated(), tab: { ...populated().tab, tabs, byLabel: (l: string) => tabs.find((t) => t.label === l) } } as unknown as Managers;

    const global = connectionCatalog(managers, 'main').filter((e) => e.kind === 'ssh');

    expect(global).toContainEqual(expect.objectContaining({ id: 'thecandykingdom', display: 'ssh:thecandykingdom', detail: 'anonymouscoward@10.27.1.94', scope: 'global' }));
  });

  it('leaves out an agent session whose handshake has not named it yet', () => {
    const managers = populated();
    vi.mocked(managers.acp.label).mockReturnValue(undefined);

    expect(connectionCatalog(managers, 'main').some((e) => e.acpRef?.scope === 'tab')).toBe(false);
  });
});

// Every name the catalog hands out — and so every name the panel, `connections list`, and completion
// offer — must parse as a `connections close` target and close exactly that connection.
describe('every catalog entry round-trips through connections close', () => {
  const entries = connectionCatalog(populated(), 'main');

  it.each(entries.map((e) => [`${e.kind}:${e.id}`, e.kind]))('closes %s', async (target, kind) => {
    const managers = populated();
    await new ConnectionManager(managers).closeTarget(kind, target.slice(`${kind}:`.length), 'main');

    if (kind === 'browser') {
      expect(managers.browser.run).toHaveBeenCalledWith('main', `browser window close ${target.slice('browser:'.length)}`);
    }
    expect(notifications.notify).toHaveBeenLastCalledWith(managers, 'connection-closed', 'main', `Closed connection ${target}.`);
  });

  it('covers every kind the catalog produces', () => {
    expect(new Set(entries.map((e) => e.kind))).toEqual(new Set(['shell', 'acp', 'browser', 'ssh', 'terminal', 'sqlite']));
  });
});
