import { describe, it, expect } from 'vitest';
import { command } from './next.js';

describe('next command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('next');
  });

  it('matches "next" case-insensitively', () => {
    expect(command.match('next')).toBe(true);
    expect(command.match('NEXT')).toBe(true);
    expect(command.match('Next')).toBe(true);
  });

  it('does not match non-next input', () => {
    expect(command.match('nextt')).toBe(false);
    expect(command.match('next next')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});

describe('next command run', () => {
  const makeManagers = (activeTab: number, length: number) => {
    const moveTab = (dir: -1 | 1) => { activeTab = (activeTab + dir + length) % length; };
    return {
      get activeTab() { return activeTab; },
      managers: { tab: { get activeTab() { return activeTab; }, moveTab, tabs: { length } } },
    };
  };

  it('advances to the next tab', () => {
    const { managers } = makeManagers(0, 3);
    command.run('next', { label: 'janus', index: 0 }, managers as never);
    expect(managers.tab.activeTab).toBe(1);
  });

  it('wraps around to the first tab from the last', () => {
    const { managers } = makeManagers(2, 3);
    command.run('next', { label: 'janus', index: 0 }, managers as never);
    expect(managers.tab.activeTab).toBe(0);
  });
});
