import type { CommandRow } from '@shared/plugins/commands/shared';
import { isAgentAccessDisabled, isParentAgentDenied, isParentDisabled, type CommandColumn } from './commands-keys';

export function CommandRowView({
  row,
  rows,
  index,
  enabledPending,
  agentPending,
  onToggle,
}: {
  row: CommandRow;
  rows: readonly CommandRow[];
  index: number;
  enabledPending: boolean;
  agentPending: boolean;
  onToggle(row: CommandRow, setting: CommandColumn, value: boolean): void;
}) {
  const parentDisabled = isParentDisabled(rows, row);
  const agentDisabled = isAgentAccessDisabled(rows, row);
  const agentDeniedByParent = row.effectiveEnabled
    && row.nativeTool !== undefined
    && isParentAgentDenied(rows, row);
  const note = row.parent !== undefined && (parentDisabled || agentDeniedByParent)
    ? `Disabled by parent command: ${row.parent}.`
    : null;

  return (
    <div
      className={`commands-row${parentDisabled ? ' commands-row-disabled' : ''}`}
      data-disabled={parentDisabled}
    >
      <span className="commands-label">
        {row.label}
        {note && <span className="commands-note">{note}</span>}
      </span>
      <span className="commands-check">
        <input
          type="checkbox"
          checked={row.enabled}
          disabled={parentDisabled || enabledPending}
          aria-label={`Enabled: ${row.label}`}
          data-row={index}
          data-column="enabled"
          onChange={(event) => { onToggle(row, 'enabled', event.target.checked); }}
        />
      </span>
      <span className="commands-check">
        {row.nativeTool !== undefined && (
          <input
            type="checkbox"
            checked={row.agentAccess}
            disabled={agentDisabled || agentPending}
            aria-label={`Agent access: ${row.label}`}
            data-row={index}
            data-column="agentAccess"
            onChange={(event) => { onToggle(row, 'agentAccess', event.target.checked); }}
          />
        )}
      </span>
    </div>
  );
}
