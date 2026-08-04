const ESC = '\u{1B}';

// Key translations applied before a keystroke reaches the PTY. xterm.js handled the Alt+Arrow one
// itself until v6 removed it ("embedder-specific"), so both live here now and neither depends on
// what the terminal library does with modifiers.

// Shift+Enter inserts a newline rather than submitting: ESC+CR (the Alt+Enter sequence), which
// harnesses like Claude Code read as a line continuation.
export function shiftEnterSequence(e: KeyboardEvent): string | null {
  if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) return `${ESC}\r`;
  return null;
}

// Alt+←/→ moves the cursor one word at a time: the sequence readline-style prompts expect, which
// differs by platform (Mac terminals send ESC b / ESC f, others the Ctrl+Arrow sequence).
export function altArrowSequence(e: KeyboardEvent, isMac: boolean): string | null {
  if (!e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return null;
  if (e.key === 'ArrowLeft') return isMac ? `${ESC}b` : `${ESC}[1;5D`;
  if (e.key === 'ArrowRight') return isMac ? `${ESC}f` : `${ESC}[1;5C`;
  return null;
}

export function isMacPlatform(): boolean {
  const platform = navigator.platform || navigator.userAgent;
  return platform.includes('Mac');
}
