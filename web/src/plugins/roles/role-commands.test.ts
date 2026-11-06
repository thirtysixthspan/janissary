import { describe, expect, it } from 'vitest';
import { availableRoleCommands, canAddRoleCommand, orderedRoleCommands } from './role-commands';

const COMMANDS = ['db sqlite list', 'browser goto', 'question ask'];

describe('role command display rules', () => {
  it('orders native commands by vocabulary and keeps duplicates adjacent', () => {
    expect(orderedRoleCommands(
      ['unknown last', 'browser goto', 'db sqlite list', 'browser goto', 'unknown first'],
      COMMANDS,
    )).toEqual([
      'db sqlite list', 'browser goto', 'browser goto', 'unknown last', 'unknown first',
    ]);
  });

  it('offers only vocabulary entries that are not already present', () => {
    expect(availableRoleCommands(['browser goto', 'future command'], COMMANDS))
      .toEqual(['db sqlite list', 'question ask']);
  });

  it('hides the add control only when every native command is present', () => {
    expect(canAddRoleCommand(['db sqlite list', 'db sqlite list', 'future command'], COMMANDS)).toBe(true);
    expect(canAddRoleCommand([...COMMANDS, 'future command'], COMMANDS)).toBe(false);
  });
});
