import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { FileNavigatorCommitStatus } from '@shared/protocol';
import { commitIcon } from '../icons';

const RESTING_TOOLTIP = 'Commit changes to origin';

const TOOLTIPS: Record<FileNavigatorCommitStatus, string> = {
  committing: 'Commit changes to origin: committing',
  committed: 'Commit changes to origin: committed',
  error: 'Commit changes to origin: failed — see notifications',
};

type Properties = {
  status?: FileNavigatorCommitStatus;
  onClick: () => void;
};

// The file navigator header's commit button: the pull button flipped. It opens the commit-message
// field over the tree, and what that field sends commits and pushes every change in the tree's
// repository — see the `fileNavigatorCommit` RPC. Shown only where the header already shows a
// branch, exactly as the pull button is. `status` is the server's own account of the commit,
// spinning the icon while one runs and colouring it once one settles. It stays clickable throughout
// for the same reason the pull button does: an overlapping click is already coalesced server-side,
// so going inert would only cost the reader the tooltip.
export function FileNavigatorCommitButton({ status, onClick }: Properties) {
  return (
    <button
      type="button"
      className={`files-commit${status ? ` files-commit--${status}` : ''}`}
      title={status ? TOOLTIPS[status] : RESTING_TOOLTIP}
      onClick={onClick}
    >
      <FontAwesomeIcon icon={commitIcon} />
    </button>
  );
}
