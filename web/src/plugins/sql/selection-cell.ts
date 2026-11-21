/** The `td` a node sits in, or null for anything outside the grid's cells. */
export function cellOf(node: Node | null): Element | null {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest('td.sql-cell') ?? null;
}

/**
 * Whether the browser's own selection was made inside one cell, which is a word the user selected
 * and not a run of rows.
 *
 * A shift-click extending a run leaves a browser selection too — from wherever the caret landed in
 * the first cell to the end of the last — and standing aside for *any* non-empty selection is what
 * stopped the grid's own copy of a run from ever running, so a pasted run lost its first value. The
 * two ends of the selection are the whole of the difference: a word's are in one cell, a run's are
 * not, however much text either of them covers.
 */
export function selectedWithinOneCell(): boolean {
  const selection = getSelection();
  if (!selection || selection.isCollapsed) return false;
  const cell = cellOf(selection.anchorNode);
  return cell !== null && cell === cellOf(selection.focusNode);
}
