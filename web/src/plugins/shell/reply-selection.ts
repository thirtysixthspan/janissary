import type { Terminal } from '@xterm/xterm';

const REPLY = '.shell-output-block';
export const REPLY_HIGHLIGHT = 'shell-reply-selection';

export type ReplySelection = {
  text(): string;
  clear(): void;
  dispose(): void;
};

function replyOf(node: Node | null): Element | null {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest(REPLY) ?? null;
}

function selectedReplyRange(container: HTMLElement): Range | undefined {
  const selection = globalThis.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return undefined;
  const reply = replyOf(selection.anchorNode);
  if (!reply || !container.contains(reply)) return undefined;
  const range = selection.getRangeAt(0).cloneRange();
  if (!reply.contains(range.startContainer)) range.setStart(reply, 0);
  if (!reply.contains(range.endContainer)) range.setEnd(reply, reply.childNodes.length);
  selection.removeAllRanges();
  selection.addRange(range);
  return range;
}

function paint(range: Range): () => void {
  if (typeof CSS === 'undefined' || !('highlights' in CSS) || typeof Highlight === 'undefined') return () => {};
  const highlight = CSS.highlights.get(REPLY_HIGHLIGHT) ?? new Highlight();
  CSS.highlights.set(REPLY_HIGHLIGHT, highlight);
  highlight.add(range);
  return () => { highlight.delete(range); };
}

// xterm.js cancels every press on its own element, which is where a rendered reply sits, so a press on
// a reply is stopped before xterm sees it and the browser can start a text selection. The selection is
// then held as a range and painted with a highlight, because the drag ends with the command bar taking
// the keyboard back, and a focused text field replaces the page's own selection.
export function holdReplySelection(
  container: HTMLElement,
  terminal: Pick<Terminal, 'clearSelection'>,
  onRelease: () => void,
): ReplySelection {
  let held = '';
  let unpaint = () => {};
  const clear = () => {
    unpaint();
    unpaint = () => {};
    held = '';
  };
  const onUp = () => {
    const range = selectedReplyRange(container);
    const text = range ? (globalThis.getSelection()?.toString() ?? '') : '';
    if (range && text.trim()) {
      held = text;
      unpaint = paint(range);
    }
    onRelease();
  };
  const onPress = (event: MouseEvent) => {
    if (event.button !== 0) return;
    clear();
    if (!(event.target instanceof Element) || !event.target.closest(REPLY)) return;
    event.stopPropagation();
    terminal.clearSelection();
    document.addEventListener('mouseup', onUp, { capture: true, once: true });
  };
  container.addEventListener('mousedown', onPress, { capture: true });
  return {
    text: () => held,
    clear,
    dispose: () => {
      clear();
      container.removeEventListener('mousedown', onPress, { capture: true });
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
