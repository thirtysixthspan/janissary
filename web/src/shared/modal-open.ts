// One app-wide answer to "is a modal dialog open?" for window-level shortcut listeners.
//
// A dialog traps the keyboard with its own capture-phase listener on `globalThis`, but
// `stopPropagation()` cannot stop other capture listeners on the same target, and the global
// shortcuts (Cmd+W, Shift+Tab) register theirs first. So a dialog registers here while it is
// mounted and those shortcuts consult it instead of a hand-picked list of dialogs.
let openCount = 0;

// Marks a modal as open. The returned release is idempotent, so a double cleanup cannot close a
// different modal that is still on screen.
export function openModal(): () => void {
  openCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openCount -= 1;
  };
}

export function isModalOpen(): boolean {
  return openCount > 0;
}
