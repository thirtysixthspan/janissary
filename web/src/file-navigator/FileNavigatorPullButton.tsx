import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { FileNavigatorPullStatus } from '@shared/protocol';
import { pullIcon } from '../icons';

const RESTING_TOOLTIP = 'Pull from origin';

const TOOLTIPS: Record<FileNavigatorPullStatus, string> = {
  pulling: 'Pull from origin: pulling',
  pulled: 'Pull from origin: pulled',
  error: 'Pull from origin: failed — see notifications',
};

type Properties = {
  status?: FileNavigatorPullStatus;
  onClick: () => void;
};

// The file navigator header's pull button: runs `git pull` at the tree's own root (on the remote
// host for a remote tree) and lets the resulting refresh redraw rows and git metadata — see the
// `fileNavigatorPull` RPC. Shown only where the header already shows a branch, like the GitHub
// button's own quiet degradation. `status` is the server's own account of the pull, spinning the
// icon while one runs and coloring it once one settles, the way `EditorSyncIcon` reflects an editor
// tab's sync. It stays clickable throughout: an overlapping click is already coalesced server-side,
// so going inert would only cost the reader the tooltip.
export function FileNavigatorPullButton({ status, onClick }: Properties) {
  return (
    <button
      type="button"
      className={`files-pull${status ? ` files-pull--${status}` : ''}`}
      title={status ? TOOLTIPS[status] : RESTING_TOOLTIP}
      onClick={onClick}
    >
      <FontAwesomeIcon icon={pullIcon} />
    </button>
  );
}
