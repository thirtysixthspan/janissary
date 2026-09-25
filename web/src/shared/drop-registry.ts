import type { EditorDropHandle, HarnessDropHandle } from './drop-handles';

// Where every visible drop target publishes the handle a file-navigator drag releases onto, keyed by
// the value the target writes on its own element: a harness body's `data-harness-drop` carries its
// PTY id, an editor body's `data-editor-drop` carries its tab label. The navigator reads that key
// straight off the element under the pointer, so the drop always reaches the terminal or editor the
// user released over — even with two of them visible side by side in split panes. A registry rather
// than a shared ref because the features may not import each other, and a single ref could only
// ever name one of them.

function createRegistry<Handle>() {
  const handles = new Map<string, Handle>();
  // Publishes `handle` under `key` and returns the function that removes it again, matching the
  // unsubscribe-returning shape of every other subscription in the client. The removal leaves a
  // later registration under the same key in place, so a remount's cleanup ordering cannot drop it.
  const register = (key: string, handle: Handle): (() => void) => {
    handles.set(key, handle);
    return () => { if (handles.get(key) === handle) handles.delete(key); };
  };
  const lookup = (key: string): Handle | undefined => handles.get(key);
  return { register, lookup };
}

const harness = createRegistry<HarnessDropHandle>();
const editor = createRegistry<EditorDropHandle>();

export const registerHarnessDrop = harness.register;
export const harnessDropHandle = harness.lookup;
export const registerEditorDrop = editor.register;
export const editorDropHandle = editor.lookup;
