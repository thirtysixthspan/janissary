import { describe, it, expect, vi } from 'vitest';
import { command, parseQueueCommand } from './queue.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

describe('queue command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('queue');
  });

  it('matches "queue" case-insensitively, bare or with arguments', () => {
    expect(command.match('queue')).toBe(true);
    expect(command.match('QUEUE')).toBe(true);
    expect(command.match('Queue')).toBe(true);
    expect(command.match('queue claude echo hi')).toBe(true);
  });

  it('does not match non-queue input', () => {
    expect(command.match('queued')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });

  it('bare "queue" is a no-op on the server (the interactive picker is client-side)', () => {
    const managers = { tab: { append: vi.fn(), enqueue: vi.fn() } } as unknown as Managers;
    command.run('queue', { label: 'janus', index: 0 }, managers);
    expect(managers.tab.append).not.toHaveBeenCalled();
    expect(managers.tab.enqueue).not.toHaveBeenCalled();
  });
});

describe('parseQueueCommand', () => {
  it('errors with no args', () => {
    expect(parseQueueCommand('queue')).toEqual({ error: 'Usage: queue <shell-tab> <command>' });
  });

  it('errors with no command text', () => {
    expect(parseQueueCommand('queue claude')).toEqual({ error: 'Usage: queue <shell-tab> <command>' });
  });

  it('parses a label and command', () => {
    expect(parseQueueCommand('queue claude echo hi')).toEqual({ label: 'claude', text: 'echo hi' });
  });
});

function makeManagers(tabs: Tab[]): { managers: Managers; appended: string[] } {
  const appended: string[] = [];
  const managers = {
    tab: {
      tabs,
      append: vi.fn((_label: string, entry: { output: string }) => { appended.push(entry.output); }),
      enqueue: vi.fn(),
    },
    pty: { terminalIdFor: vi.fn() },
    plugins: { declarations: [{ id: 'shell', capabilities: ['queueLine', 'nextQueuedLine'] }] },
  } as unknown as Managers;
  return { managers, appended };
}

function makeAgentTab(label: string): Tab {
  return {
    label, dotColor: '#fff', number: 1, group: 1, groupColor: '#fff', log: [],
    cmdHistory: [], cmdHistoryIdx: -1, scrollOffset: 0,
  };
}

describe('queue command run (with an agent target)', () => {
  it('reports unknown tab', () => {
    const { managers, appended } = makeManagers([]);
    command.run('queue ghost echo hi', { label: 'janus', index: 0 }, managers);
    expect(appended).toEqual(['No tab named "ghost".']);
  });

  it('refuses a non-agent target', () => {
    const target = { ...makeAgentTab('viewer'), view: 'image' as const };
    const { managers, appended } = makeManagers([target]);
    command.run('queue viewer echo hi', { label: 'janus', index: 0 }, managers);
    expect(appended).toEqual(['Tab "viewer" has no command queue.']);
    expect(managers.tab.enqueue).not.toHaveBeenCalled();
  });

  it('queues for a plugin tab with an owned terminal using the core queue', () => {
    const target = { ...makeAgentTab('shell'), view: 'plugin' as const, plugin: { id: 'shell' } };
    const { managers, appended } = makeManagers([target]);
    vi.mocked(managers.pty.terminalIdFor).mockReturnValue('shell-pty');

    command.run('queue shell ls -al', { label: 'janus', index: 0 }, managers);

    expect(managers.tab.enqueue).toHaveBeenCalledWith('shell', 'ls -al');
    expect(appended).toEqual(['→ shell (queued): ls -al']);
  });

  it('queues for a plugin tab whose workspace clone is still provisioning, using the core queue', () => {
    const target = { ...makeAgentTab('docs'), view: 'plugin' as const, plugin: { id: 'shell' }, workspaceDir: '/repo/.janissary/workspace/docs' };
    const { managers, appended } = makeManagers([target]);
    Object.assign(managers, { workspace: { provisioning: vi.fn(() => true) } });

    command.run('queue docs pwd', { label: 'janus', index: 0 }, managers);

    expect(managers.tab.enqueue).toHaveBeenCalledWith('docs', 'pwd');
    expect(appended).toEqual(['→ docs (queued): pwd']);
  });
});
