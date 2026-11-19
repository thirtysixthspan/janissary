import { icon } from '@fortawesome/fontawesome-svg-core';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import type { IBuffer, IMarker, Terminal } from '@xterm/xterm';

export type ThinkingMarkerView = { kind: 'running' | 'link'; name: string; onOpen: () => void };

export type ThinkingMarkerHandle = {
  show(view: ThinkingMarkerView): void;
  remove(): void;
};

type MarkerTerminal = Pick<Terminal, 'element' | 'rows' | 'cols' | 'buffer' | 'registerDecoration'>;

const LABELS = { running: 'Thinking', link: 'see thought process' } as const;

function isUsable(size: number): boolean {
  return Number.isFinite(size) && size > 0;
}

function lastRowOf(buffer: IBuffer, row: number): number | undefined {
  if (!buffer.getLine(row)) return undefined;
  let last = row;
  let next = buffer.getLine(last + 1);
  while (next?.isWrapped) {
    last += 1;
    next = buffer.getLine(last + 1);
  }
  return last;
}

function anchorOf(terminal: MarkerTerminal, marker: IMarker): number | undefined {
  const buffer = terminal.buffer.active;
  if (buffer.type !== 'normal' || marker.line < 0) return undefined;
  const end = lastRowOf(buffer, marker.line);
  if (end === undefined) return undefined;
  const row = end - buffer.viewportY;
  return row >= 0 && row + 1 < terminal.rows ? row : undefined;
}

function place(element: HTMLElement, terminal: MarkerTerminal, marker: IMarker): void {
  const screen = terminal.element?.querySelector<HTMLElement>('.xterm-screen');
  if (!screen) return;
  const rowHeight = screen.clientHeight / terminal.rows;
  const cellWidth = screen.clientWidth / terminal.cols;
  const anchor = isUsable(rowHeight) && isUsable(cellWidth) ? anchorOf(terminal, marker) : undefined;
  if (anchor === undefined) {
    element.style.display = 'none';
    return;
  }
  element.style.width = 'auto';
  element.style.display = 'block';
  element.style.marginLeft = '0px';
  element.style.top = `${(anchor + 1) * rowHeight}px`;
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
