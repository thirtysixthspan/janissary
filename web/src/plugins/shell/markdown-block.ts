import type { Terminal } from '@xterm/xterm';
import { renderMarkdown } from '../api';

const BLOCK_CLASSES = ['line', 'markdown', 'shell-output-block'];

function measure(screen: HTMLElement, html: string, rowHeight: number): number {
  const probe = document.createElement('div');
  probe.classList.add(...BLOCK_CLASSES);
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.width = `${screen.clientWidth}px`;
  probe.style.lineHeight = `${rowHeight}px`;
  probe.innerHTML = html;
  screen.append(probe);
  const height = probe.offsetHeight;
  probe.remove();
  return height;
}

// A reply's links open through the application, never by navigating its window: every anchor click
// is stopped, and the opener decides which hrefs it knows how to open.
function routeLinkClicks(element: HTMLElement, openLink: (href: string) => void): void {
  element.addEventListener('click', (event) => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor || !element.contains(anchor)) return;
    event.preventDefault();
    openLink(anchor.getAttribute('href') ?? '');
  });
}

function fill(element: HTMLElement, html: string, openLink: (href: string) => void): void {
  if (element.dataset.shellOutput === 'filled') return;
  element.dataset.shellOutput = 'filled';
  element.classList.add(...BLOCK_CLASSES);
  element.innerHTML = html;
  routeLinkClicks(element, openLink);
}

function position(element: HTMLElement, terminal: Terminal, markerLine: number, rows: number): void {
  const screen = terminal.element?.querySelector<HTMLElement>('.xterm-screen');
  if (terminal.buffer.active.type !== 'normal' || !screen) {
    element.style.display = 'none';
    return;
  }
  const rowHeight = screen.clientHeight / terminal.rows;
  if (!Number.isFinite(rowHeight) || rowHeight <= 0) return;
  const topRow = markerLine - terminal.buffer.active.viewportY - rows + 1;
  const visible = topRow < terminal.rows && topRow + rows > 0;
  element.style.top = `${topRow * rowHeight}px`;
  element.style.display = visible ? 'block' : 'none';
}

export function insertMarkdownBlock(
  terminal: Terminal, line: string, markdown: string, openLink: (href: string) => void,
): boolean {
  const html = renderMarkdown(markdown);
  const screen = terminal.element?.querySelector<HTMLElement>('.xterm-screen');
  if (html === undefined || !screen || terminal.buffer.active.type !== 'normal' || terminal.rows < 3) return false;
  const rowHeight = screen.clientHeight / terminal.rows;
  if (!Number.isFinite(rowHeight) || rowHeight <= 0) return false;
  const height = measure(screen, html, rowHeight);
  if (height <= 0) return false;
  const rows = Math.ceil(height / rowHeight);
  terminal.write(`\r\u{1B}[2K> ${line}\r\n${'\r\n'.repeat(rows)}`, () => {
    const marker = terminal.registerMarker(-1);
    const decoration = terminal.registerDecoration({ marker, width: terminal.cols, height: rows, layer: 'top' });
    decoration?.onRender((element) => {
      fill(element, html, openLink);
      position(element, terminal, marker.line, rows);
    });
    terminal.write('> ');
  });
  return true;
}
