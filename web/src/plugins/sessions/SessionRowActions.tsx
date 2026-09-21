import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleXmark, faTrash } from '@fortawesome/free-solid-svg-icons';
import type { SessionRow, SessionRowAction } from '@shared/plugins/sessions/shared';
import { detachSessionIcon, attachSessionIcon } from '../api';

// The per-row buttons. Icon-only and right-aligned, the way the conversations list's are, with the
// verb in the accessible label so a row reads correctly without the icon.
//
// The three that act on a connection carry the host's plug glyphs, so the same verb means the same
// picture here and on a remote tab's metadata row. Forget and close keep their own: neither touches
// the connection.

type Presentation = { icon: typeof faTrash; label: string };

const PRESENTATION: Record<Exclude<SessionRowAction, 'focus'>, Presentation> = {
  attach: { icon: attachSessionIcon, label: 'Attach' },
  detach: { icon: detachSessionIcon, label: 'Detach' },
  terminate: { icon: faCircleXmark, label: 'Terminate' },
  forget: { icon: faTrash, label: 'Forget session' },
  close: { icon: faCircleXmark, label: 'Close' },
};

// `focus` is what opening the row already does, so it carries no button of its own: a second
// control for the gesture the row itself is would be one more thing to explain.
const BUTTONS: Exclude<SessionRowAction, 'focus'>[] = ['attach', 'detach', 'terminate', 'close', 'forget'];

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
        // The same shape covers a terminate already reaching the host: pressing Terminate again would
        // open a second ssh connection to the same peer and leak the first, since that channel is
        // keyed by a label the second attempt overwrites.
        const inFlight = row.terminating === true && (action === 'terminate' || action === 'attach');
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
