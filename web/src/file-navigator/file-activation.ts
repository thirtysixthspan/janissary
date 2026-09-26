const MARKDOWN_EXTENSION = /\.(md|markdown)$/i;

// What activating a file row asks the opener registry for: the edit gesture, or the plain open. A
// Markdown row inverts the pair — double-clicking one reaches the plain-text editor and
// Shift+double-clicking it reaches the rendered preview — so a Markdown file edits on a plain
// activation and opens on a shifted one, and every other file does the reverse. The mouse and the
// keyboard both read this, so a plugin declaring its own edit gesture gets the same answer from
// either.
export function fileActivation(path: string, shift: boolean): boolean {
  return MARKDOWN_EXTENSION.test(path) !== shift;
}
