import type { CommandRow, CommandSettingName } from '@shared/plugins/commands/shared';

export type CommandColumn = CommandSettingName;
export type CommandFocus = { row: number; column: CommandColumn };

export function isParentDisabled(rows: readonly CommandRow[], row: CommandRow): boolean {
  return row.parent !== undefined
    && rows.some((candidate) => candidate.name === row.parent && !candidate.effectiveEnabled);
}

export function isEnabledDisabled(rows: readonly CommandRow[], row: CommandRow): boolean {
  return isParentDisabled(rows, row);
}

export function isAgentAccessDisabled(rows: readonly CommandRow[], row: CommandRow): boolean {
  return isEnabledDisabled(rows, row)
    || !row.effectiveEnabled
    || (row.agentAccess && !row.effectiveAgentAccess);
}

function targetColumn(rows: readonly CommandRow[], row: CommandRow, column: CommandColumn): CommandColumn | null {
  if (column === 'agentAccess' && row.nativeTool !== undefined && !isAgentAccessDisabled(rows, row)) {
    return 'agentAccess';
  }
  return isEnabledDisabled(rows, row) ? null : 'enabled';
}

export function moveCommandFocus(
  rows: readonly CommandRow[],
  current: CommandFocus,
  direction: 'ArrowDown' | 'ArrowUp',
): CommandFocus | null {
  const step = direction === 'ArrowDown' ? 1 : -1;
  for (let index = current.row + step; index >= 0 && index < rows.length; index += step) {
    const column = targetColumn(rows, rows[index], current.column);
    if (column !== null) return { row: index, column };
  }
  return null;
}
