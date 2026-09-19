import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faLink, faStop, faTrash, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { SessionRow, SessionRowAction } from '@shared/plugins/sessions/shared';

// The per-row buttons. Icon-only and right-aligned, the way the conversations list's are, with the
// verb in the accessible label so a row reads correctly without the icon.

type Presentation = { icon: typeof faLink; label: string };

const PRESENTATION: Record<Exclude<SessionRowAction, 'focus'>, Presentation> = {
  reattach: { icon: faLink, label: 'Reconnect' },
  detach: { icon: faLink, label: 'Disconnect' },
  end: { icon: faStop, label: 'End session' },
  forget: { icon: faTrash, label: 'Forget session' },
  close: { icon: faXmark, label: 'Close' },
};

// `focus` is what opening the row already does, so it carries no button of its own: a second
// control for the gesture the row itself is would be one more thing to explain.
const BUTTONS: Exclude<SessionRowAction, 'focus'>[] = ['reattach', 'detach', 'end', 'close', 'forget'];

export function SessionRowActions({
  row,
  onAction,
}: {
  row: SessionRow;
  onAction(action: SessionRowAction): void;
}) {
  return (
    <span className="session-row-actions">
      {BUTTONS.filter((action) => row.actions.includes(action)).map((action) => {
        const { icon, label } = PRESENTATION[action];
        // Decision 12: while a workspace is still landing there is nothing to come back to, so the
        // control stays where the eye expects it and is simply not pressable yet.
        //
        // The same shape covers an end attempt already reaching the host: pressing End again would
        // open a second ssh connection to the same peer and leak the first, since the end channel is
        // keyed by a label the second attempt overwrites.
        const inFlight = row.ending === true && (action === 'end' || action === 'reattach');
        const disabled = (action === 'detach' && row.state === 'provisioning') || inFlight;
        return (
          <button
            key={action}
            type="button"
            disabled={disabled}
            data-action={action}
            title={label}
            aria-label={`${label} ${row.name}`}
            onClick={(event) => { event.stopPropagation(); onAction(action); }}
          >
            <FontAwesomeIcon icon={icon} />
          </button>
        );
      })}
    </span>
  );
}
