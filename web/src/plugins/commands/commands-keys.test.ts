import { describe, expect, it } from 'vitest';
import type { CommandRow } from '@shared/plugins/commands/shared';
import { moveCommandFocus } from './commands-keys';

function row(overrides: Partial<CommandRow> = {}): CommandRow {
  return {
    name: 'quit',
    label: 'quit',
    enabled: true,
    agentAccess: true,
    effectiveEnabled: true,
    effectiveAgentAccess: true,
    ...overrides,
  };
}

const NATIVE = { nativeTool: 'browser' } as const;

describe('moveCommandFocus', () => {
  it('moves to the same column on the next and previous row', () => {
    const rows = [row({ label: 'a' }), row({ label: 'b' }), row({ label: 'c' })];

    expect(moveCommandFocus(rows, { row: 0, column: 'enabled' }, 'ArrowDown'))
      .toEqual({ row: 1, column: 'enabled' });
    expect(moveCommandFocus(rows, { row: 2, column: 'enabled' }, 'ArrowUp'))
      .toEqual({ row: 1, column: 'enabled' });
  });

  it('keeps the agent-access column when the next row offers it enabled', () => {
    const rows = [row({ label: 'a', ...NATIVE }), row({ label: 'b', ...NATIVE })];

    expect(moveCommandFocus(rows, { row: 0, column: 'agentAccess' }, 'ArrowDown'))
      .toEqual({ row: 1, column: 'agentAccess' });
  });

  it('falls back to Enabled when the matching toggle is absent', () => {
    const rows = [row({ label: 'a', ...NATIVE }), row({ label: 'b' })];

    expect(moveCommandFocus(rows, { row: 0, column: 'agentAccess' }, 'ArrowDown'))
      .toEqual({ row: 1, column: 'enabled' });
  });

  it('falls back to Enabled when the matching agent toggle is disabled', () => {
    const rows = [
      row({ label: 'a', ...NATIVE }),
      row({ label: 'b', ...NATIVE, effectiveAgentAccess: false }),
    ];

    expect(moveCommandFocus(rows, { row: 0, column: 'agentAccess' }, 'ArrowDown'))
      .toEqual({ row: 1, column: 'enabled' });
  });

  it('skips a row where both toggles are disabled by its parent', () => {
    const rows = [
      row({ name: 'a', label: 'a' }),
      row({ name: 'b', label: 'b', ...NATIVE, parent: 'parent' }),
      row({ name: 'c', label: 'c' }),
      row({ name: 'parent', label: 'parent', enabled: false, effectiveEnabled: false }),
    ];

    expect(moveCommandFocus(rows, { row: 0, column: 'enabled' }, 'ArrowDown'))
      .toEqual({ row: 2, column: 'enabled' });
  });

  it('keeps a self-disabled row targetable when no parent is disabled', () => {
    const rows = [row({ name: 'a', label: 'a' }), row({ name: 'b', label: 'b', enabled: false, effectiveEnabled: false })];

    expect(moveCommandFocus(rows, { row: 0, column: 'enabled' }, 'ArrowDown'))
      .toEqual({ row: 1, column: 'enabled' });
  });

  it('stops at the first and last rows without wrapping', () => {
    const rows = [row({ label: 'a' }), row({ label: 'b' })];

    expect(moveCommandFocus(rows, { row: 0, column: 'enabled' }, 'ArrowUp')).toBeNull();
    expect(moveCommandFocus(rows, { row: 1, column: 'enabled' }, 'ArrowDown')).toBeNull();
  });

  it('never targets the blank agent-access cell of a non-native row', () => {
    const rows = [row({ label: 'a' }), row({ label: 'b' }), row({ label: 'c' })];

    expect(moveCommandFocus(rows, { row: 0, column: 'agentAccess' }, 'ArrowDown'))
      .toEqual({ row: 1, column: 'enabled' });
  });
});
