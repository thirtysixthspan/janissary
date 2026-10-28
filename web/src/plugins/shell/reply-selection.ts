import type { Terminal } from '@xterm/xterm';

const REPLY = '.shell-output-block';
export const REPLY_HIGHLIGHT = 'shell-reply-selection';

type Point = { node: Node; offset: number };
type Drag = { reply: Element; anchor: Point; range: Range };

export type ReplySelection = {
  text(): string;
  clear(): void;
  dispose(): void;
};

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function caretAt(x: number, y: number): Point | undefined {
  if (typeof document.caretPositionFromPoint !== 'function') return undefined;
  const caret = document.caretPositionFromPoint(x, y);
  return caret ? { node: caret.offsetNode, offset: caret.offset } : undefined;
}

function edgeOf(reply: Element, atStart: boolean): Point {
  return { node: reply, offset: atStart ? 0 : reply.childNodes.length };
}

function pointIn(reply: Element, view: DOMRect, x: number, y: number): Point {
  const box = reply.getBoundingClientRect();
  if (y < box.top || y >= box.bottom) return edgeOf(reply, y < box.top);
  const caret = caretAt(
    clamp(x, Math.max(box.left, view.left) + 1, Math.min(box.right, view.right) - 1),
    clamp(y, Math.max(box.top, view.top) + 1, Math.min(box.bottom, view.bottom) - 1),
  );
  if (caret && reply.contains(caret.node)) return caret;
  return edgeOf(reply, y < (box.top + box.bottom) / 2);
}

function spanBetween(range: Range, anchor: Point, focus: Point): void {
  range.setStart(anchor.node, anchor.offset);
  range.collapse(true);
  if (range.comparePoint(focus.node, focus.offset) < 0) range.setStart(focus.node, focus.offset);
  else range.setEnd(focus.node, focus.offset);
}

function withAncestors(range: Range, reply: Element): Node {
  let content: Node = range.cloneContents();
  const common = range.commonAncestorContainer;
  let element = common instanceof Element ? common : common.parentElement;
  while (element && element !== reply && reply.contains(element)) {
    const wrapper = element.cloneNode(false) as Element;
    wrapper.append(content);
    content = wrapper;
    element = element.parentElement;
  }
  return content;
}

function textOf(range: Range, reply: Element): string {
  const holder = document.createElement('div');
  holder.className = reply.className;
  holder.style.position = 'fixed';
  holder.style.left = '-100000px';
  holder.append(withAncestors(range, reply));
  document.body.append(holder);
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- the rendered text keeps a reply's line breaks and cell tabs, which textContent drops
  const text = holder.innerText;
  holder.remove();
  return text || range.toString();
}

function paint(range: Range): () => void {
  if (typeof CSS === 'undefined' || !('highlights' in CSS) || typeof Highlight === 'undefined') return () => {};
  const highlight = CSS.highlights.get(REPLY_HIGHLIGHT) ?? new Highlight();
  CSS.highlights.set(REPLY_HIGHLIGHT, highlight);
  highlight.add(range);
  return () => { highlight.delete(range); };
}

function stopLinkClick(event: MouseEvent): void {
  if (!(event.target instanceof Element) || !event.target.closest('a[href]')) return;
  event.preventDefault();
  event.stopPropagation();
}

// xterm.js cancels every press on its own element, where a rendered reply sits, and the browser's
// own selection would not survive the command bar keeping the keyboard: a focused text field
// replaces the page's selection. So a press on a reply is kept from xterm and its drag is selected
// here, as a range painted with a highlight, from the caret under the pointer. Past the reply's top
// or bottom the selection runs to its start or end, because xterm's rows come before its decorations
// in the document and the browser would otherwise carry a downward drag back above its start.
export function holdReplySelection(container: HTMLElement, terminal: Pick<Terminal, 'clearSelection'>): ReplySelection {
  let held = '';
  let unpaint = () => {};
  let drag: Drag | undefined;
  const clear = () => {
    unpaint();
    unpaint = () => {};
    held = '';
  };
  const onMove = (event: MouseEvent) => {
    if (!drag) return;
    spanBetween(drag.range, drag.anchor, pointIn(drag.reply, container.getBoundingClientRect(), event.clientX, event.clientY));
  };
  const onUp = (event: MouseEvent) => {
    onMove(event);
    document.removeEventListener('mousemove', onMove, { capture: true });
    document.removeEventListener('mouseup', onUp, { capture: true });
    const finished = drag;
    drag = undefined;
    if (!finished || finished.range.collapsed) {
      clear();
      return;
    }
    held = textOf(finished.range, finished.reply);
    container.addEventListener('click', stopLinkClick, { capture: true, once: true });
    setTimeout(() => { container.removeEventListener('click', stopLinkClick, { capture: true }); }, 0);
  };
  const onPress = (event: MouseEvent) => {
    if (event.button !== 0) return;
    clear();
    const reply = event.target instanceof Element ? event.target.closest(REPLY) : null;
    if (!reply) return;
    event.preventDefault();
    event.stopPropagation();
    terminal.clearSelection();
    const anchor = pointIn(reply, container.getBoundingClientRect(), event.clientX, event.clientY);
    drag = { reply, anchor, range: document.createRange() };
    spanBetween(drag.range, anchor, anchor);
    unpaint = paint(drag.range);
    document.addEventListener('mousemove', onMove, { capture: true });
    document.addEventListener('mouseup', onUp, { capture: true });
  };
  container.addEventListener('mousedown', onPress, { capture: true });
  return {
    text: () => held,
    clear,
    dispose: () => {
      drag = undefined;
      clear();
      container.removeEventListener('mousedown', onPress, { capture: true });
      document.removeEventListener('mousemove', onMove, { capture: true });
      document.removeEventListener('mouseup', onUp, { capture: true });
    },
  };
}

export function shellSelectionText(
  reply: Pick<ReplySelection, 'text'> | null,
  terminal: Pick<Terminal, 'hasSelection' | 'getSelection'> | null,
): string {
  const held = reply?.text() ?? '';
  if (held) return held;
  return terminal?.hasSelection() ? terminal.getSelection() : '';
}
