import type { HarnessDropHandle } from './drop-handles';

// Where every mounted harness tab publishes the handle a file-navigator drag releases onto, keyed
// by the tab's PTY id. The navigator reads that id straight off the `[data-harness-drop]` element
// under the pointer, so the drop always reaches the terminal the user released over — even with two
// harness tabs visible side by side in split panes. A registry rather than a shared ref because the
// two features may not import each other, and a single ref could only ever name one of them.

const handles = new Map<string, HarnessDropHandle>();

// Publishes `handle` for `ptyId` and returns the function that removes it again, matching the
// unsubscribe-returning shape of every other subscription in the client.
export function registerHarnessDrop(ptyId: string, handle: HarnessDropHandle): () => void {
  handles.set(ptyId, handle);
  return () => { handles.delete(ptyId); };
}

export function harnessDropHandle(ptyId: string): HarnessDropHandle | undefined {
  return handles.get(ptyId);
}
