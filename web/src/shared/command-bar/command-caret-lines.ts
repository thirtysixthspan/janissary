// Whether the caret sits on the command line's first or last visual line. ArrowUp/ArrowDown
// recall history only from those two positions — anywhere else in a multi-line value the native
// caret movement wins. A single-line value counts as both the first and the last line, and a
// caret we cannot read (no element, or a textarea reporting no selection) counts as being on the
// edge so recall still works.

export function isCaretOnFirstLine(value: string, caret: number | null | undefined): boolean {
  if (!value.includes('\n') || caret == null) return true;
  return value.lastIndexOf('\n', caret - 1) === -1;
}

export function isCaretOnLastLine(value: string, caret: number | null | undefined): boolean {
  if (!value.includes('\n') || caret == null) return true;
  return !value.includes('\n', caret);
}
