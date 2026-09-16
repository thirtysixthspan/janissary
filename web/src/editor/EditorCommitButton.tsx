import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { EditorView, FileNavigatorCommitStatus } from '@shared/protocol';
import { commitIcon } from '../icons';

const STATE_NOTES: Record<FileNavigatorCommitStatus, string> = {
  committing: 'committing',
  committed: 'committed',
  error: 'failed — see notifications',
};

type Properties = {
  commit: EditorView['commit'];
  onClick: () => void;
};

// The editor tab metadata row's commit-to-origin icon: the navigator's commit button reduced to
// this one file. Saves happen first (the row's save path), then the commit/push cycle runs — the
// icon spins in flight, colours itself when the cycle settles, and returns to rest a few seconds
// later.
export function EditorCommitButton({ commit, onClick }: Properties) {
  return (
    <button
      type="button"
      className={`editor-commit-button${commit ? ` editor-commit-button--${commit}` : ''}`}
      title={commit ? `Commit to origin: ${STATE_NOTES[commit]}` : 'Commit to origin'}
      aria-label={commit ? `Commit to origin: ${STATE_NOTES[commit]}` : 'Commit to origin'}
      onClick={onClick}
    >
      <FontAwesomeIcon icon={commitIcon} />
    </button>
  );
}
