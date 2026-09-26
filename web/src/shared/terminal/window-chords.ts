// The chords the window key handler owns, defined once so the full-tab terminals can let exactly
// these bubble instead of restating them. Keys a terminal deliberately keeps for its program
// (Ctrl+←/→ word motion, Ctrl+R reverse search, Ctrl+E end-of-line) are not part of either set.

// Shift+←/→, plus Cmd+Shift+[/] — the macOS tab-switch convention. Shift changes the produced `key`
// on a US layout ('{'/'}' rather than '['/']'), so both forms count.
export function isTabSwitchChord(e: KeyboardEvent): boolean {
  if (e.shiftKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return true;
  return e.metaKey && e.shiftKey && ['[', '{', ']', '}'].includes(e.key);
}

// Bare Ctrl+A (task picker) and Ctrl+G (tab navigator).
export function isPickerChord(e: KeyboardEvent): boolean {
  if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return false;
  const key = e.key.toLowerCase();
  return key === 'a' || key === 'g';
}
