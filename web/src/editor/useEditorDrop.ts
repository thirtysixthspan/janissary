import { useEffect, useRef, type RefObject } from 'react';
import { registerEditorDrop } from '../shared/drop-registry';

// A file-navigator drag released over this editor's body inserts its paths at the cursor. The body
// carries `data-editor-drop={label}`, and the handle is published under that same label while the
// editor is visible, so a drop reaches the editor under the pointer even with two editors side by
// side in split panes; a hidden editor publishes nothing.
//
// Focuses the textarea before inserting: the caller is a drag release, so focus is still in the file
// tree, where the letters the user types next are a type-to-select gesture rather than text.
//
// Both insertion members focus first and are then the editor's own two doors: `insert` leaves the
// caret at the end of what it inserted, so a dropped file can be carried on typing from; `paste`
// leaves it at the start, which is what a paste in this editor does everywhere else.
export function useEditorDrop(
  label: string, visible: boolean, textareaRef: RefObject<HTMLTextAreaElement | null>,
  insert: (text: string) => void, paste?: (text: string) => void,
): void {
  const insertRef = useRef(insert);
  insertRef.current = insert;
  const pasteRef = useRef(paste);
  pasteRef.current = paste;
  useEffect(() => {
    if (!visible) return;
    const focus = () => textareaRef.current?.focus();
    return registerEditorDrop(label, {
      insertAtCaret: (text: string) => { focus(); insertRef.current(text); },
      pasteAtCaret: (text: string) => { focus(); pasteRef.current?.(text); },
    });
  }, [label, visible, textareaRef]);
}
