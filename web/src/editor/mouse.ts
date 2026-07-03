// Point → (line, col) mapping for mouse selection. The line index comes from the row's data
// attribute; the column from caretPositionFromPoint (caretRangeFromPoint fallback) resolved to a
// string offset within the row's content cell.

export type MouseHit = { line: number; col: number; inGutter: boolean };

// Total text offset of (node, offset) within `cell`, summing the text nodes before it in
// document order (the content cell may be split into selection/caret spans).
export function textOffsetIn(cell: Node, node: Node, offset: number): number {
  if (node === cell) {
    // The caret landed on the element itself (e.g. an empty line): offset counts child nodes.
    let total = 0;
    for (let index = 0; index < Math.min(offset, cell.childNodes.length); index++) {
      total += (cell.childNodes[index].textContent ?? '').length;
    }
    return total;
  }
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current === node) return total + offset;
    total += (current.textContent ?? '').length;
    current = walker.nextNode();
  }
  return total;
}

type CaretPoint = { offsetNode: Node; offset: number };
type DocumentWithCaret = Document & {
  caretPositionFromPoint?: (x: number, y: number) => CaretPoint | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

function caretPointAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as DocumentWithCaret;
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    if (p) return { node: p.offsetNode, offset: p.offset };
  }
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

// Column for a point inside a row's content cell.
export function pointToCol(cell: HTMLElement, x: number, y: number): number {
  const caret = caretPointAt(x, y);
  if (!caret || !cell.contains(caret.node)) return 0;
  return textOffsetIn(cell, caret.node, caret.offset);
}

// Resolve a mouse event against the editor body: which line row it hit, the column within it,
// and whether it landed in the gutter (line-selection margin). Null when outside any row.
export function hitFromEvent(e: { target: EventTarget | null; clientX: number; clientY: number }): MouseHit | null {
  const target = e.target instanceof Element ? e.target : null;
  const row = target?.closest('[data-editor-line]');
  if (!(row instanceof HTMLElement)) return null;
  const line = Number(row.dataset.editorLine);
  if (Number.isNaN(line)) return null;
  const inGutter = !!target?.closest('.editor-gutter');
  const cell = row.querySelector('.editor-content');
  const col = !inGutter && cell instanceof HTMLElement ? pointToCol(cell, e.clientX, e.clientY) : 0;
  return { line, col, inGutter };
}

// During a drag, the pointer may be over gaps/scrollbar: fall back to elementFromPoint against
// the whole editor body and clamp vertically to the first/last row.
export function hitFromPoint(body: HTMLElement, x: number, y: number): MouseHit | null {
  const element = document.elementFromPoint(x, y);
  if (element && body.contains(element)) return hitFromEvent({ target: element, clientX: x, clientY: y });
  // Above or below the body: clamp to the first or last line.
  const rows = body.querySelectorAll('[data-editor-line]');
  if (rows.length === 0) return null;
  const first = rows[0].getBoundingClientRect();
  if (y < first.top) return { line: 0, col: 0, inGutter: false };
  const lastRow = [...rows].at(-1) as HTMLElement;
  const lastLine = Number(lastRow.dataset.editorLine);
  return { line: lastLine, col: Number.MAX_SAFE_INTEGER, inGutter: false };
}
