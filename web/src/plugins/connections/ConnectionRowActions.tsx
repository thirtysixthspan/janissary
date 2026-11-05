import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleXmark, faTrash } from '@fortawesome/free-solid-svg-icons';
import type { ConnectionRow, LiveConnectionRow, RecordConnectionRow } from '@shared/plugins/connections/shared';

// The per-row buttons, icon-only in the trailing actions column the way the sessions table's are,
// with the verb and the row's title in the accessible label. Close takes the sessions table's close
// glyph and Delete its forget glyph, because each does the same thing to its row there.

export function canClose(row: ConnectionRow): row is LiveConnectionRow | RecordConnectionRow {
  if (row.type === 'live') return row.permanent !== true;
  return row.kind === 'acp' && ['Running', 'Idle'].includes(row.status);
}

export function canDelete(row: ConnectionRow): row is RecordConnectionRow {
  return row.type === 'record' && row.kind === 'acp' && row.status === 'Closed';
}

export function ConnectionRowActions({
  row,
  label,
  onClose,
  onDelete,
}: {
  row: ConnectionRow;
  label: string;
  onClose(row: LiveConnectionRow | RecordConnectionRow): void;
  onDelete(row: RecordConnectionRow): void;
}) {
  return (
    <span className="connections-row-actions">
      {canClose(row) && (
        <button
          type="button"
          data-action="close"
          title="Close"
          aria-label={`Close ${label}`}
          onClick={(event) => { event.stopPropagation(); onClose(row); }}
        >
          <FontAwesomeIcon icon={faCircleXmark} />
        </button>
      )}
      {canDelete(row) && (
        <button
          type="button"
          data-action="delete"
          title="Delete"
          aria-label={`Delete ${label}`}
          onClick={(event) => { event.stopPropagation(); onDelete(row); }}
        >
          <FontAwesomeIcon icon={faTrash} />
        </button>
      )}
    </span>
  );
}
