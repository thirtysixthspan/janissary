import React, { useState } from 'react';
import { committableMessage } from './file/navigator-commit-message';

type Properties = {
  defaultMessage: string;
  fileCount: number;
  onCommit: (message: string) => void;
  onCancel: () => void;
};

// The file navigator's commit-message field: one line, pre-filled with a generated default, opened
// by the header's commit button and by the row menu's `Commit to origin`. Enter commits and pushes
// what is in it, Escape cancels with nothing written, and an empty or whitespace-only value cancels
// too — the same silent no-op the rename field applies to a name the user emptied out. Keystrokes
// stop here rather than reaching the tree's own key handler, which would otherwise eat the typing.
//
// It deliberately does *not* close on blur, unlike `FileSearchPopup` and the rename field. What
// those two would discard is a query or a filename the user can retype in seconds; what this one
// would discard is a sentence they composed. Clicking away therefore leaves it open with its text
// intact, and only Enter and Escape decide its fate.
export function FileNavigatorCommitPopup({ defaultMessage, fileCount, onCommit, onCancel }: Properties) {
  const [message, setMessage] = useState(defaultMessage);
  const title = fileCount === 1 ? 'Commit message' : `Commit message (${fileCount} files)`;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      const approved = committableMessage(message);
      if (approved) onCommit(approved); else onCancel();
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  return (
    <div className="picker files-commit-popup" data-doc-shot="file-navigator-commit-popup">
      <div className="picker-title">{title}</div>
      <div className="command">
        <div className="input-wrap">
          <input
            value={message}
            autoFocus
            spellCheck={false}
            placeholder="Commit message…"
            aria-label="Commit message"
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
    </div>
  );
}
