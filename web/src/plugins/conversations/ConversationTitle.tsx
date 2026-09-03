import React, { useRef, useState } from 'react';
import { InlineEditInput } from '../api';

// The cap an automatic title already carries — the first line of the first query, trimmed to this —
// so a renamed conversation cannot hold a title its first query could not have produced. The server
// applies the same cap; this one keeps the field from accepting what would be silently trimmed.
const TITLE_MAX_LENGTH = 60;

export type ConversationTitleProperties = {
  title: string;
  deleted: boolean;
  onRename: (title: string) => void;
};

// The conversation's name in its metadata row, renamed the way a tab is: double-click, type, Enter
// or click away to commit, Escape to cancel.
export function ConversationTitle({ title, deleted, onRename }: ConversationTitleProperties) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Escape cancels and blurs the input; the resulting blur event must not also commit.
  const cancelledRef = useRef(false);

  if (!editing) {
    return (
      <span
        className="plugin-name"
        onDoubleClick={() => {
          if (deleted) return;
          cancelledRef.current = false;
          setDraft(title);
          setEditing(true);
        }}
      >{title}</span>
    );
  }

  const commit = () => {
    if (cancelledRef.current) return;
    setEditing(false);
    // An empty name is not a name. Committing one changes nothing rather than leaving the
    // conversation with a blank row in the list.
    const next = draft.trim();
    if (next && next !== title) onRename(next);
  };

  return (
    <InlineEditInput
      className="conversation-title-input"
      value={draft}
      maxLength={TITLE_MAX_LENGTH}
      size={Math.max(draft.length, 1)}
      onChange={(value) => { setDraft(value.slice(0, TITLE_MAX_LENGTH)); }}
      onCommit={commit}
      onCancel={() => { cancelledRef.current = true; setEditing(false); }}
    />
  );
}
