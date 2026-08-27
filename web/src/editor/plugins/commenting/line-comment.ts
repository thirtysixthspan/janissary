// The line-comment strategy: one marker per line, placed at the shallowest common indent so code
// keeps its relative indentation and the markers line up in a column.

import type { EditorPluginEdit } from '../api';

export type LineToggle = { edits: EditorPluginEdit[]; lastLineWidth: number };

const BLANK = /^\s*$/u;

const isBlank = (line: string): boolean => BLANK.test(line);

const indentOf = (line: string): number => line.length - line.trimStart().length;

// The column every marker goes in: the first non-whitespace column of the least-indented non-blank
// line. A range that is entirely blank has no indent to speak of, so it takes column 0.
function commonIndent(lines: readonly string[]): number {
  const indents = lines.filter((line) => !isBlank(line)).map((line) => indentOf(line));
  return indents.length === 0 ? 0 : Math.min(...indents);
}

// Where an existing marker sits on a line, or -1. Found wherever it is rather than only at the
// common indent, so a hand-edited block still uncomments cleanly.
function markerAt(line: string, marker: string): number {
  const trimmed = line.trimStart();
  return trimmed.startsWith(marker) ? indentOf(line) : -1;
}

// Direction: uncomment only when every non-blank line already carries the marker. Blank lines are
// excluded from the test, so a range of two commented lines separated by a blank still uncomments.
export function allCommented(lines: readonly string[], marker: string): boolean {
  const meaningful = lines.filter((line) => !isBlank(line));
  return meaningful.length > 0 && meaningful.every((line) => markerAt(line, marker) !== -1);
}

function commentEdit(
  line: string, lineNumber: number, indent: number, marker: string,
): EditorPluginEdit {
  // A line shorter than the common indent — a blank one, or one of only a few spaces — is padded out
  // to that column so the whole commented block reads as contiguous.
  const column = Math.min(indent, line.length);
  const padding = ' '.repeat(Math.max(0, indent - line.length));
  return {
    start: { line: lineNumber, col: column },
    end: { line: lineNumber, col: column },
    text: `${padding}${marker} `,
  };
}

function uncommentEdit(
  line: string, lineNumber: number, marker: string,
): EditorPluginEdit | null {
  const at = markerAt(line, marker);
  if (at === -1) return null;
  const after = at + marker.length;
  // One following space comes off with the marker, so `// x` round-trips; a comment hand-written
  // without a space keeps every character that is not the marker itself.
  const width = marker.length + (line.slice(after, after + 1) === ' ' ? 1 : 0);
  return { start: { line: lineNumber, col: at }, end: { line: lineNumber, col: at + width }, text: '' };
}

export function toggleLineComments(
  lines: readonly string[], baseLine: number, marker: string,
): LineToggle {
  const uncommenting = allCommented(lines, marker);
  const indent = commonIndent(lines);
  const edits: EditorPluginEdit[] = [];
  let lastLineWidth = (lines.at(-1) ?? '').length;

  for (const [offset, line] of lines.entries()) {
    const lineNumber = baseLine + offset;
    const edit = uncommenting
      ? uncommentEdit(line, lineNumber, marker)
      : commentEdit(line, lineNumber, indent, marker);
    if (!edit) continue;
    edits.push(edit);
    if (offset === lines.length - 1) {
      lastLineWidth = line.length - (edit.end.col - edit.start.col) + edit.text.length;
    }
  }

  return { edits, lastLineWidth };
}
