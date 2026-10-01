// How a copied block of text becomes the one line the popup shows.
//
// The rule is the first line of non-space text, which is not the same as the first line: a copy taken
// from the middle of an indented block, or of output that starts with blank lines, has text the user
// recognizes on some line rather than the first one. Whitespace is stripped from the front of the
// whole text before the first line is taken, so leading newlines and leading indentation both go.
//
// An ellipsis marks that there was more than this one line. A long single line is a different case
// and is left to CSS to truncate, because whether it "is too long" depends on how wide the popup
// happens to be — which is not a fact this function has, and guessing a character count would be an
// answer to a question about layout.

export const MORE_MARKER = '…';

export type DisplayLine = {
  // What the row reads. Never the whole text.
  label: string;
  // Whether more of the copied text followed the line above.
  truncated: boolean;
};

export function displayLine(text: string): DisplayLine {
  const trimmed = text.trimStart();
  const firstLine = trimmed.split('\n', 1)[0] ?? '';
  const truncated = trimmed.length > firstLine.length;
  return { label: truncated ? `${firstLine}${MORE_MARKER}` : firstLine, truncated };
}
