import type { EditorView } from '@shared/protocol';

// Whether an editor tab opens with its metadata-row rename session already running: a new file
// whose name was picked for the user (the file navigator's `untitled.md`). A new file the user
// named when opening it (`newfile <file>`) opens in its buffer instead.
export function opensRenameSession(editor: EditorView): boolean {
  return editor.newFile === true && editor.named !== true;
}
