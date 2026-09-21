import React, { useEffect, useRef, useState } from 'react';
import type { EditorView } from '@shared/protocol';
import { TAB_RENAME_MAX_LENGTH } from '@shared/config';
import { InlineEditInput } from '../shared/InlineEditInput';

// The editor tab's name in its metadata row. Once a "new file" session the name auto-starts in
// edit mode — pre-selected with keyboard focus — the same rename the tab label already offers;
// afterwards it renames by double-click like the conversations plugin's title. Enter or a click
// away commits (server-side first-save auto-suffix still applies); Escape keeps the default name.
export function EditorMetaName({
  editor, onCommit, onCancel, onEditingChange,
}: {
  editor: EditorView;
  onCommit: (next: string) => void;
  onCancel: () => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  // The edit session starts live for a new file, mirroring the host's own gating flag: seeding
  // both sides at mount keeps the buffer's load-focus from stealing the keyboard.
  const [editing, setEditing] = useState(editor.newFile === true);
  const [draft, setDraft] = useState(editor.name);
  // Escape clears this file's edit session; the resulting blur event must not also commit.
  const cancelledRef = useRef(false);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    if (autoStartedRef.current || !editor.newFile) return;
    autoStartedRef.current = true;
    cancelledRef.current = false;
    setDraft(editor.name);
    setEditing(true);
  }, [editor.newFile, editor.name]);

  // The editor body steals focus back when its buffer finishes loading; the host gates that on
  // this flag so the freshly opened rename session keeps the keyboard.
  useEffect(() => { onEditingChange?.(editing); }, [editing, onEditingChange]);

  const commit = () => {
    if (cancelledRef.current) return;
    setEditing(false);
    const next = draft.trim();
    if (next && next !== editor.name) onCommit(next);
    else onCancel();
  };

  if (editing) {
    return (
      <InlineEditInput
        className="editor-name-input"
        value={draft}
        maxLength={TAB_RENAME_MAX_LENGTH}
        size={Math.max(draft.length, 1)}
        onChange={(value) => setDraft(value.slice(0, TAB_RENAME_MAX_LENGTH))}
        onCommit={commit}
        onCancel={() => { cancelledRef.current = true; setEditing(false); onCancel(); }}
      />
    );
  }
  return (
    <span
      className="editor-name"
      onDoubleClick={() => { cancelledRef.current = false; setDraft(editor.name); setEditing(true); }}
    >{editor.name}</span>
  );
}
