import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { EditorView, FileNavigatorCommitStatus } from '@shared/protocol';
import { commitIcon } from '../icons';
import { commitBranchTooltipSuffix } from '../shared/commit-branch-tooltip';

const STATE_NOTES: Record<FileNavigatorCommitStatus, string> = {
  committing: 'committing',
  committed: 'committed',
  error: 'failed — see notifications',
};

type Properties = {
  commit: EditorView['commit'];
  branch?: string;
  onClick: () => void;
};

// The editor tab metadata row's commit-to-origin icon: the navigator's commit button reduced to
// this one file. Saves happen first (the row's save path), then the commit/push cycle runs — the
// icon spins in flight, colours itself when the cycle settles, and returns to rest a few seconds
// later. The tooltip names the target branch the same way the navigator's own commit button does.
export function EditorCommitButton({ commit, branch, onClick }: Properties) {
  const target = commitBranchTooltipSuffix(branch);
  const state = commit ? `: ${STATE_NOTES[commit]}` : '';
  const title = `Commit to origin${target}${state}`;
  return (
    <button
      type="button"
      className={`editor-commit-button${commit ? ` editor-commit-button--${commit}` : ''}`}
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      <FontAwesomeIcon icon={commitIcon} />
    </button>
  );
}
