// DOM hit-testing for a file-navigator drag gesture: which surface is under the pointer.

export function hoveredElement(x: number, y: number, selector: string): Element | null {
  const element = document.elementFromPoint(x, y);
  return element instanceof Element ? element.closest(selector) : null;
}

// The PTY id of the harness terminal under the pointer, which is the key its own drop handle is
// registered under — null when the pointer is over no harness at all.
export function hoveredHarnessPty(x: number, y: number): string | null {
  const body = hoveredElement(x, y, '[data-harness-drop]');
  return body instanceof HTMLElement ? body.dataset.harnessDrop ?? null : null;
}

export function hoveredRowInfo(
  x: number, y: number,
): { path: string | null; host?: string; root?: string } {
  const row = hoveredElement(x, y, '[data-path]');
  if (!(row instanceof HTMLElement)) return { path: null };
  const tree = row.closest('.files-tab');
  const host = tree instanceof HTMLElement ? tree.dataset.filesHost || undefined : undefined;
  const root = tree instanceof HTMLElement ? tree.dataset.filesRoot : undefined;
  return { path: row.dataset.path ?? null, host, root };
}
