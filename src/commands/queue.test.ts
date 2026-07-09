import { describe, it, expect, vi } from 'vitest';
import { command, parseQueueCommand } from './queue.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../types.js';

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
    const managers = { tab: { append: vi.fn(), enqueue: vi.fn() }, command: { drainQueue: vi.fn() } } as unknown as Managers;
    command.run('queue', { label: 'janus', index: 0 }, managers);
    expect(managers.tab.append).not.toHaveBeenCalled();
    expect(managers.tab.enqueue).not.toHaveBeenCalled();
  });
});

describe('parseQueueCommand', () => {
  it('errors with no args', () => {
    expect(parseQueueCommand('queue')).toEqual({ error: 'Usage: queue <agent> <command>' });
  });

  it('errors with no command text', () => {
    expect(parseQueueCommand('queue claude')).toEqual({ error: 'Usage: queue <agent> <command>' });
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
    command: { drainQueue: vi.fn() },
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

  it('appends to the target queue, drains, and confirms', () => {
    const target = makeAgentTab('worker');
    const { managers, appended } = makeManagers([target]);
    command.run('queue worker echo hi', { label: 'janus', index: 0 }, managers);
    expect(managers.tab.enqueue).toHaveBeenCalledWith('worker', 'echo hi');
    expect(managers.command.drainQueue).toHaveBeenCalledWith('worker');
    expect(appended).toEqual(['→ worker (queued): echo hi']);
  });

  it('matches a target by its display alias', () => {
    const target = { ...makeAgentTab('worker'), title: 'reviewer' };
    const { managers, appended } = makeManagers([target]);
    command.run('queue reviewer echo hi', { label: 'janus', index: 0 }, managers);
    expect(managers.tab.enqueue).toHaveBeenCalledWith('worker', 'echo hi');
    expect(appended).toEqual(['→ reviewer (queued): echo hi']);
  });
});
