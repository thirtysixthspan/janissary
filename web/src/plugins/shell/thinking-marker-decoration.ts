import { icon } from '@fortawesome/fontawesome-svg-core';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import type { IBuffer, IBufferLine, IMarker, Terminal } from '@xterm/xterm';

export type ThinkingMarkerView = { kind: 'running' | 'link'; name: string; onOpen: () => void };

export type ThinkingMarkerHandle = {
  show(view: ThinkingMarkerView): void;
  remove(): void;
};

type MarkerTerminal = Pick<Terminal, 'element' | 'rows' | 'cols' | 'buffer' | 'registerDecoration'>;
type Anchor = { line: IBufferLine; row: number };

const LABELS = { running: 'Thinking', link: 'see thought process' } as const;

function isUsable(size: number): boolean {
  return Number.isFinite(size) && size > 0;
}

function lastRowOf(buffer: IBuffer, row: number): Anchor | undefined {
  let line = buffer.getLine(row);
  if (!line) return undefined;
  let last = row;
  let next = buffer.getLine(last + 1);
  while (next?.isWrapped) {
    line = next;
    last += 1;
    next = buffer.getLine(last + 1);
  }
  return { line, row: last };
}

function cellsUsed(line: IBufferLine, cols: number): number {
  for (let x = Math.min(line.length, cols) - 1; x >= 0; x--) {
    const cell = line.getCell(x);
    if (cell && cell.getChars() !== '') return x + cell.getWidth();
  }
  return 0;
}

function offsetFor(cells: number, cellWidth: number, width: number, screenWidth: number): number {
  const wanted = (cells + 1) * cellWidth;
  return wanted + width > screenWidth ? Math.max(0, screenWidth - width) : wanted;
}

function anchorOf(terminal: MarkerTerminal, marker: IMarker): Anchor | undefined {
  const buffer = terminal.buffer.active;
  if (buffer.type !== 'normal' || marker.line < 0) return undefined;
  const end = lastRowOf(buffer, marker.line);
  if (!end) return undefined;
  const row = end.row - buffer.viewportY;
  return row >= 0 && row < terminal.rows ? { line: end.line, row } : undefined;
}

function place(element: HTMLElement, terminal: MarkerTerminal, marker: IMarker): void {
  const screen = terminal.element?.querySelector<HTMLElement>('.xterm-screen');
  if (!screen) return;
  const rowHeight = screen.clientHeight / terminal.rows;
  const cellWidth = screen.clientWidth / terminal.cols;
  const anchor = isUsable(rowHeight) && isUsable(cellWidth) ? anchorOf(terminal, marker) : undefined;
  if (!anchor) {
    element.style.display = 'none';
    return;
  }
  element.style.width = 'auto';
  element.style.display = 'block';
  const cells = cellsUsed(anchor.line, terminal.cols);
  const offset = offsetFor(cells, cellWidth, element.offsetWidth, screen.clientWidth);
  element.style.marginLeft = `${offset}px`;
  element.style.top = `${anchor.row * rowHeight}px`;
}

function fill(element: HTMLElement, view: ThinkingMarkerView): void {
  const label = element.ownerDocument.createElement('span');
  label.textContent = LABELS[view.kind];
  const spinner = view.kind === 'running' ? icon(faSpinner, { classes: ['fa-spin'] }).node[0] : undefined;
  element.classList.add('shell-thinking-marker');
  element.dataset.kind = view.kind;
  element.setAttribute('role', 'link');
  element.title = `Open ${view.name}`;
  element.setAttribute('aria-label', `Open ${view.name}`);
  element.replaceChildren(...(spinner ? [label, spinner] : [label]));
}

function listen(element: HTMLElement, open: () => void): void {
  element.addEventListener('click', open);
  element.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
}

export function addThinkingMarker(terminal: MarkerTerminal, marker: IMarker, view: ThinkingMarkerView): ThinkingMarkerHandle {
  const decoration = terminal.registerDecoration({ marker, width: 1, height: 1, layer: 'top' });
  if (!decoration) return { show: () => {}, remove: () => {} };
  let current = view;
  let element: HTMLElement | undefined;
  let removed = false;
  decoration.onRender((rendered) => {
    if (!element) {
      element = rendered;
      fill(element, current);
      listen(element, () => { current.onOpen(); });
    }
    place(element, terminal, marker);
  });
  return {
    show(next) {
      if (removed) return;
      current = next;
      if (!element) return;
      fill(element, current);
      place(element, terminal, marker);
    },
    remove() {
      if (removed) return;
      removed = true;
      decoration.dispose();
      marker.dispose();
    },
  };
}
