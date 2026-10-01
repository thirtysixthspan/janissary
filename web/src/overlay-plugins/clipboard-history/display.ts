// How a copied block of text becomes the one line the popup shows.
//
// The rule is the first line of non-space text, which is not the same as the first line: a copy taken
// from the middle of an indented block, or of output that starts with blank lines, has text the user
// recognizes on some line rather than the first. Whitespace is stripped from the front of the
// whole text before the first line is taken, so leading newlines and leading indentation both go.
//
// A copy of more than one line says so with a `(N lines)` postfix beside that line. The count is of
// the text with whitespace stripped from both ends, so a copy that merely ends in a newline is not
// reported as two lines. The postfix is shown and never pasted.
//
// An ellipsis is left to CSS, and only for a line too long for the row, because whether it "is too
// long" depends on how wide the popup happens to be — which is not a fact this function has, and
// guessing a character count would be an answer to a question about layout.

export type DisplayLine = {
  // What the row reads. Never the whole text.
  label: string;
  // `(N lines)` when the copy had more than one line, and empty otherwise.
  postfix: string;
};

export function displayLine(text: string): DisplayLine {
  const trimmed = text.trimStart();
  const label = trimmed.split('\n', 1)[0] ?? '';
  const lines = trimmed.trimEnd().split('\n').length;
  return { label, postfix: lines > 1 ? `(${lines} lines)` : '' };
}
