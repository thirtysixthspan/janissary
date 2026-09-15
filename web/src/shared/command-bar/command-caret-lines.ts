import { wrapsWithinRow } from './caret-row-width';

// Whether the caret sits on the command line's first or last visual row. ArrowUp/ArrowDown
// recall history only from those two positions — anywhere else (including a wrapped row within
// a single explicit line) the native caret movement wins. A single-line value counts as both the
// first and the last line, and a caret we cannot read (no element, or a textarea reporting no
// selection) counts as being on the edge so recall still works. `element`, when given, refines an
// explicit-line edge further: an explicit line can wrap into more than one visual row on its own,
// so being the first/last explicit line is not yet being the first/last visual row of it.

export function isCaretOnFirstLine(
  value: string, caret: number | null | undefined, element?: HTMLTextAreaElement | null,
): boolean {
  if (caret == null) return true;
  if (value.lastIndexOf('\n', caret - 1) !== -1) return false;
  return !element || !wrapsWithinRow(element, value.slice(0, caret));
}

export function isCaretOnLastLine(
  value: string, caret: number | null | undefined, element?: HTMLTextAreaElement | null,
): boolean {
  if (caret == null) return true;
  if (value.includes('\n', caret)) return false;
  return !element || !wrapsWithinRow(element, value.slice(caret));
}
