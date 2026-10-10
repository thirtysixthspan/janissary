import { describe, expect, it } from 'vitest';
import { makeTab } from './index.js';
import { resolveTabGroup, tabGroupName } from './groups.js';

describe('tab group identity', () => {
  it('names group 1 launch and gives other numeric groups a stable generated name', () => {
    expect(tabGroupName(makeTab('janus', '#111'))).toBe('launch');
    expect(tabGroupName(makeTab('review', '#222', 2, [], [], undefined, 7))).toBe('group-7');
  });

  it('inherits the creator group when no selector is given', () => {
    const creator = makeTab('janus', '#111');
    creator.groupName = 'launch';
    expect(resolveTabGroup([creator], undefined, creator, '#222')).toEqual({
      id: 1, name: 'launch', color: creator.groupColor,
    });
  });

  it('finds a named group without regard to case', () => {
    const tab = makeTab('review', '#222', 2, [], [], undefined, 4, '#444', 'Review');
    expect(resolveTabGroup([tab], 'review', undefined, '#555')).toEqual({
      id: 4, name: 'Review', color: '#444',
    });
  });

  it('finds a group by ID and creates an unknown numeric group with a generated name', () => {
    const tab = makeTab('review', '#222', 2, [], [], undefined, 4, '#444', 'Review');
    expect(resolveTabGroup([tab], '4', undefined, '#555')).toEqual({ id: 4, name: 'Review', color: '#444' });
    expect(resolveTabGroup([tab], '9', undefined, '#555')).toEqual({ id: 9, name: 'group-9', color: '#555' });
  });

  it('creates a new named group with the next available ID', () => {
    const tabs = [
      makeTab('janus', '#111'), makeTab('review', '#222', 2, [], [], undefined, 7),
    ];
    expect(resolveTabGroup(tabs, 'feature', undefined, '#333')).toEqual({
      id: 8, name: 'feature', color: '#333',
    });
  });

  it('rejects zero and unsafe numeric IDs', () => {
    expect(() => resolveTabGroup([], '0', undefined, '#111')).toThrow('group id must be a positive integer');
    expect(() => resolveTabGroup([], '9007199254740992', undefined, '#111')).toThrow('group id must be a positive integer');
  });
});
