// Navigation half of the queue popup's key handling (see `CommandInput`'s queueOpen branch for
// the text-adjacent half: typing and Backspace-on-empty). Up/Down move the selector, each move
// copying the newly selected row into the command line (via `setQueueIndex`). Enter is an
// explicit no-op — it must not submit, run, or close. Escape closes the popup (the passed-in
// `setQueueOpen` also clears the command line when called with `false` — see `useQueuePicker`'s
// `closeQueue`). Printable keys and Backspace are deliberately NOT handled here so they fall
// through to the command-line textarea.
export function handleQueueKey(
  e: KeyboardEvent,
  items: string[],
  _queueIdx: number,
  setQueueIndex: (setter: (prev: number) => number) => void,
  setQueueOpen: (open: boolean) => void,
): boolean {
  switch (e.key) {
  case 'ArrowUp': { e.preventDefault(); setQueueIndex((index) => Math.max(0, index - 1)); return true; }
  case 'ArrowDown': { e.preventDefault(); setQueueIndex((index) => Math.min(items.length - 1, index + 1)); return true; }
  case 'Enter': { e.preventDefault(); return true; }
  case 'Escape': { e.preventDefault(); setQueueOpen(false); return true; }
  }
  return false;
}
