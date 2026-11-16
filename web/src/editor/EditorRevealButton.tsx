import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { EditorView } from '@shared/protocol';
import { openFilesIcon } from '../shared/icons';

const ENABLED_TITLE = 'Reveal in file navigator';

const BLOCKED_NOTES: Record<NonNullable<EditorView['revealBlocked']>, string> = {
  unsaved: 'save the file first',
  'no-route': 'reopen from a remote navigator',
};

function revealTitle(revealBlocked: EditorView['revealBlocked']): string {
  return revealBlocked
    ? `${ENABLED_TITLE} (${BLOCKED_NOTES[revealBlocked]})`
    : ENABLED_TITLE;
}

type Properties = {
  revealBlocked: EditorView['revealBlocked'];
  onReveal: () => void;
};

export function EditorRevealButton({ revealBlocked, onReveal }: Properties) {
  const title = revealTitle(revealBlocked);
  return (
    <button
      type="button"
      className="editor-reveal-button"
      title={title}
      aria-label={title}
      disabled={revealBlocked !== undefined}
      onMouseUp={(event) => { event.stopPropagation(); }}
      onClick={onReveal}
    >
      <FontAwesomeIcon icon={openFilesIcon} />
    </button>
  );
}
