import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClone, faPersonRunning, faTrashCan } from '@fortawesome/free-solid-svg-icons';

export type RowAction = 'run' | 'duplicate' | 'delete';

const BUTTONS: { action: RowAction; label: string; icon: typeof faTrashCan }[] = [
  { action: 'run', label: 'Run', icon: faPersonRunning },
  { action: 'duplicate', label: 'Duplicate', icon: faClone },
  { action: 'delete', label: 'Delete', icon: faTrashCan },
];

export function ScriptRowActions({ name, onAction }: {
  name: string;
  onAction: (action: RowAction) => void;
}) {
  return (
    <span className="scripts-row-actions">
      {BUTTONS.map(({ action, label, icon }) => (
        <button
          key={action}
          type="button"
          data-action={action}
          title={label}
          aria-label={`${label} ${name}`}
          onClick={(event) => {
            event.stopPropagation();
            onAction(action);
          }}
        >
          <FontAwesomeIcon icon={icon} />
        </button>
      ))}
    </span>
  );
}
