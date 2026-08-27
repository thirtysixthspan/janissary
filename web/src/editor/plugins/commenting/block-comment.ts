// The block-comment strategy, for languages with no line comment at all: the whole range is wrapped
// in a single open/close pair rather than each line being marked.

import type { EditorPluginEdit } from '../api';

export type BlockToggle = { edits: EditorPluginEdit[]; lastLineWidth: number };

const indentOf = (line: string): number => line.length - line.trimStart().length;

// "Already commented" means the range is exactly wrapped — the first line's content opens it and the
// last line's ends it. A range with a stray marker loose inside is not wrapped, so it wraps again.
export function isWrapped(lines: readonly string[], open: string, close: string): boolean {
  const first = lines[0].trimStart();
  if (!first.startsWith(open)) return false;
  const last = (lines.at(-1) ?? '').trimEnd();
  if (!last.endsWith(close)) return false;
  // One line carrying both halves has to be long enough to hold them separately.
  if (lines.length === 1) return first.trimEnd().length >= open.length + close.length;
  return true;
}

function wrap(
  lines: readonly string[], baseLine: number, open: string, close: string,
): BlockToggle {
  const lastIndex = lines.length - 1;
  const lastLine = lines[lastIndex];
  const openAt = Math.min(indentOf(lines[0]), lines[0].length);
  const openEdit: EditorPluginEdit = {
    start: { line: baseLine, col: openAt },
    end: { line: baseLine, col: openAt },
    text: `${open} `,
  };
  const closeEdit: EditorPluginEdit = {
    start: { line: baseLine + lastIndex, col: lastLine.length },
    end: { line: baseLine + lastIndex, col: lastLine.length },
    text: ` ${close}`,
  };
  const grownByOpen = lastIndex === 0 ? open.length + 1 : 0;
  return {
    edits: [openEdit, closeEdit],
    lastLineWidth: lastLine.length + grownByOpen + close.length + 1,
  };
}

function unwrap(
  lines: readonly string[], baseLine: number, open: string, close: string,
): BlockToggle {
  const lastIndex = lines.length - 1;
  const lastLine = lines[lastIndex];
  const openAt = indentOf(lines[0]);
  const afterOpen = openAt + open.length;
  const openWidth = open.length + (lines[0].slice(afterOpen, afterOpen + 1) === ' ' ? 1 : 0);

  const trimmedEnd = lastLine.trimEnd();
  const closeStart = trimmedEnd.length - close.length;
  const spaced = lastLine.slice(closeStart - 1, closeStart) === ' ';
  const closeFrom = spaced ? closeStart - 1 : closeStart;

  const openEdit: EditorPluginEdit = {
    start: { line: baseLine, col: openAt },
    end: { line: baseLine, col: openAt + openWidth },
    text: '',
  };
  const closeEdit: EditorPluginEdit = {
    start: { line: baseLine + lastIndex, col: closeFrom },
    end: { line: baseLine + lastIndex, col: lastLine.length },
    text: '',
  };
  const shrunkByOpen = lastIndex === 0 ? openWidth : 0;
  return {
    edits: [openEdit, closeEdit],
    lastLineWidth: closeFrom - shrunkByOpen,
  };
}

export function toggleBlockComment(
  lines: readonly string[], baseLine: number, open: string, close: string,
): BlockToggle {
  return isWrapped(lines, open, close)
    ? unwrap(lines, baseLine, open, close)
    : wrap(lines, baseLine, open, close);
}
