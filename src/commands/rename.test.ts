import { describe, it, expect, vi } from 'vitest';
import { command } from './rename.js';
import type { Managers } from '../managers.js';

describe('rename command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('rename');
  });

  it('matches "rename" case-insensitively, with or without an argument', () => {
    expect(command.match('rename')).toBe(true);
    expect(command.match('rename foo')).toBe(true);
    expect(command.match('RENAME foo')).toBe(true);
  });

  it('does not match non-rename input', () => {
    expect(command.match('renamed')).toBe(false);
    expect(command.match('rena')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });

  it('prints a reserved-name refusal instead of a false success message', async () => {
    const refusal = 'Cannot use "system": that name is reserved for the system tab.';
    const appendForInvocation = vi.fn();
    const managers = { tab: { renameTab: vi.fn(() => refusal), appendForInvocation } } as unknown as Managers;
    await command.run('rename SyStEm', { label: 'janus', index: 0 } as never, managers, { invocationId: 'request' } as never);
    expect(managers.tab.renameTab).toHaveBeenCalledWith(0, 'SyStEm');
    expect(appendForInvocation).toHaveBeenCalledWith(
      'janus', { input: 'rename SyStEm', output: refusal }, 'request',
    );
  });
});
