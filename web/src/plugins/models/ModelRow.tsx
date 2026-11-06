import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import type { ModelRow } from '@shared/plugins/models/shared';

export function ModelRowView({
  row,
  narrow,
  onDelete,
}: {
  row: ModelRow;
  narrow: boolean;
  onDelete(): void;
}) {
  const actions = !row.disabled && (
    <span className="models-row-actions">
      <button
        type="button"
        title="Delete"
        aria-label={`Delete ${row.id}`}
        data-action="delete"
        onClick={onDelete}
      >
        <FontAwesomeIcon icon={faTrash} />
      </button>
    </span>
  );

  return (
    <div className={`models-row${row.disabled ? ' models-row-disabled' : ''}`} data-disabled={row.disabled}>
      {narrow ? (
        <>
          <div className="models-row-primary">
            <span className="models-row-id">{row.id}</span>
            {actions}
          </div>
          <div className="models-row-secondary">
            <span className="models-row-name">{row.name}</span>
            <span className="models-row-harness">{row.harness}</span>
          </div>
        </>
      ) : (
        <>
          <span className="models-row-id">{row.id}</span>
          <span className="models-row-name">{row.name}</span>
          <span className="models-row-harness">{row.harness}</span>
          {actions}
        </>
      )}
    </div>
  );
}
