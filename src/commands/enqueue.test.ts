import { describe, it, expect, vi } from 'vitest';
import { command, parseEnqueueCommand } from './enqueue.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../types.js';

describe('enqueue command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('enqueue');
  });

  it('matches enqueue commands', () => {
    expect(command.match('enqueue claude echo hi')).toBe(true);
    expect(command.match('ENQUEUE claude echo hi')).toBe(true);
  });

  it('does not match non-enqueue input', () => {
    expect(command.match('enqueued')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});

describe('parseEnqueueCommand', () => {
  it('errors with no args', () => {
    expect(parseEnqueueCommand('enqueue')).toEqual({ error: 'Usage: enqueue <agent> <command>' });
  });

  it('errors with no command text', () => {
    expect(parseEnqueueCommand('enqueue claude')).toEqual({ error: 'Usage: enqueue <agent> <command>' });
  });

  it('parses a label and command', () => {
    expect(parseEnqueueCommand('enqueue claude echo hi')).toEqual({ label: 'claude', text: 'echo hi' });
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

describe('enqueue command run', () => {
  it('reports unknown tab', () => {
    const { managers, appended } = makeManagers([]);
    command.run('enqueue ghost echo hi', { label: 'janus', index: 0 }, managers);
    expect(appended).toEqual(['No tab named "ghost".']);
  });

  it('refuses a non-agent target', () => {
    const target = { ...makeAgentTab('viewer'), view: 'image' as const };
    const { managers, appended } = makeManagers([target]);
    command.run('enqueue viewer echo hi', { label: 'janus', index: 0 }, managers);
    expect(appended).toEqual(['Tab "viewer" has no command queue.']);
    expect(managers.tab.enqueue).not.toHaveBeenCalled();
  });

  it('appends to the target queue, drains, and confirms', () => {
    const target = makeAgentTab('worker');
    const { managers, appended } = makeManagers([target]);
    command.run('enqueue worker echo hi', { label: 'janus', index: 0 }, managers);
    expect(managers.tab.enqueue).toHaveBeenCalledWith('worker', 'echo hi');
    expect(managers.command.drainQueue).toHaveBeenCalledWith('worker');
    expect(appended).toEqual(['→ worker (queued): echo hi']);
  });

  it('matches a target by its display alias', () => {
    const target = { ...makeAgentTab('worker'), title: 'reviewer' };
    const { managers, appended } = makeManagers([target]);
    command.run('enqueue reviewer echo hi', { label: 'janus', index: 0 }, managers);
    expect(managers.tab.enqueue).toHaveBeenCalledWith('worker', 'echo hi');
    expect(appended).toEqual(['→ reviewer (queued): echo hi']);
  });
});
