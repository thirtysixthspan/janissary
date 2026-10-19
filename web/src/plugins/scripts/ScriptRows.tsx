import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { RunscriptRow } from '@shared/plugins/scripts/shared';
import { scheduleWindowIcon } from '../api';
import { ScriptRowActions, type RowAction } from './ScriptRowActions';

export function ScriptRows({ rows, selectedIndex, onSelect, onOpen, onRowAction }: {
  rows: RunscriptRow[];
  selectedIndex: number | null;
  onSelect: (name: string) => void;
  onOpen: (name: string) => void;
  onRowAction: (name: string, action: RowAction) => void;
}) {
  return (
    <>
      {rows.map((row, index) => (
        <div
          key={row.name}
          role="button"
          tabIndex={-1}
          aria-selected={index === selectedIndex}
          className={`scripts-row${index === selectedIndex ? ' selected' : ''}`}
          data-index={index}
          onClick={() => onSelect(row.name)}
          onDoubleClick={() => onOpen(row.name)}
        >
          <span className="scripts-num">{index + 1})</span>
          <span className="scripts-name" title={row.name}>{row.name}</span>
          {row.schedules > 0 && (
            <span
              role="img"
              className="scripts-clock"
              title="Used by a system schedule"
              aria-label="Used by a system schedule"
            >
              <FontAwesomeIcon icon={scheduleWindowIcon} />
            </span>
          )}
          <ScriptRowActions name={row.name} onAction={(action) => onRowAction(row.name, action)} />
        </div>
      ))}
    </>
  );
}
