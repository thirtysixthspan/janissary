import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faTrash } from '@fortawesome/free-solid-svg-icons';

export type HostRowAction = 'edit' | 'delete';

const ACTIONS: { action: HostRowAction; label: string; icon: typeof faTrash }[] = [
  { action: 'edit', label: 'Edit', icon: faPen },
  { action: 'delete', label: 'Delete', icon: faTrash },
];

export function HostRowActions({ name, onAction }: {
  name: string;
  onAction(action: HostRowAction): void;
}) {
  return (
    <span className="host-row-actions">
      {ACTIONS.map(({ action, label, icon }) => (
        <button
          key={action}
          type="button"
          data-action={action}
          title={label}
          aria-label={`${label} host ${name}`}
          onClick={(event) => { event.stopPropagation(); onAction(action); }}
        >
          <FontAwesomeIcon icon={icon} />
        </button>
      ))}
    </span>
  );
}
