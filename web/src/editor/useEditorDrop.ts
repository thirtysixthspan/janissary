import { useEffect, useRef, type RefObject } from 'react';
import { registerEditorDrop } from '../shared/drop-registry';

// A file-navigator drag released over this editor's body inserts its paths at the cursor. The body
// carries `data-editor-drop={label}`, and the handle is published under that same label while the
// editor is visible, so a drop reaches the editor under the pointer even with two editors side by
// side in split panes; a hidden editor publishes nothing.
//
// Focuses the textarea before inserting: the caller is a drag release, so focus is still in the file
// tree, where the letters the user types next are a type-to-select gesture rather than text.
// `insert` leaves the caret at the end of what it inserted, so once focus is here the user simply
// carries on typing from there.
export function useEditorDrop(
  label: string, visible: boolean, textareaRef: RefObject<HTMLTextAreaElement | null>,
  insert: (text: string) => void,
): void {
  const insertRef = useRef(insert);
  insertRef.current = insert;
  useEffect(() => {
    if (!visible) return;
    return registerEditorDrop(label, {
      insertAtCaret: (text: string) => {
        textareaRef.current?.focus();
        insertRef.current(text);
      },
    });
  }, [label, visible, textareaRef]);
}
