import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { pullIcon } from '../icons';

type Properties = {
  onClick: () => void;
};

// The file navigator header's pull button: runs `git pull` at the tree's own root (on the remote
// host for a remote tree) and lets the resulting refresh redraw rows and git metadata — see the
// `fileNavigatorPull` RPC. Shown only where the header already shows a branch, like the GitHub
// button's own quiet degradation.
export function FileNavigatorPullButton({ onClick }: Properties) {
  return (
    <button
      type="button" className="files-pull" title="Pull from origin"
      onClick={onClick}
    >
      <FontAwesomeIcon icon={pullIcon} />
    </button>
  );
}
