import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { FileNavigatorCommitStatus } from '@shared/protocol';
import { commitIcon } from '../icons';

const STATUS_NOTES: Record<FileNavigatorCommitStatus, string> = {
  committing: 'committing',
  committed: 'committed',
  error: 'failed — see notifications',
};

type Properties = {
  status?: FileNavigatorCommitStatus;
  branch?: string;
  onClick: () => void;
};

// The tooltip's branch segment: the push goes to the checked-out branch's own name on `origin`,
// so naming it tells the reader where the commit will land.
function tooltipSuffix(branch?: string): string {
  return branch ? ` (branch ${branch})` : '';
}

// The file navigator header's commit button: the pull button flipped. It opens the commit-message
// field over the tree, and what that field sends commits and pushes every change in the tree's
// repository — see the `fileNavigatorCommit` RPC. Shown only where the header already shows a
// branch, exactly as the pull button is. `status` is the server's own account of the commit,
// spinning the icon while one runs and colouring it once one settles. It stays clickable throughout
// for the same reason the pull button does: an overlapping click is already coalesced server-side,
// so going inert would only cost the reader the tooltip.
export function FileNavigatorCommitButton({ status, branch, onClick }: Properties) {
  const target = tooltipSuffix(branch);
  const state = status ? `: ${STATUS_NOTES[status]}` : '';
  return (
    <button
      type="button"
      className={`files-commit${status ? ` files-commit--${status}` : ''}`}
      title={`Commit changes to origin${target}${state}`}
      onClick={onClick}
    >
      <FontAwesomeIcon icon={commitIcon} />
    </button>
  );
}
