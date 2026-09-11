// The two things the default context menu actually does, kept free of React so the clipboard rules
// are testable without a render. Every API here is feature-detected: a browser may withhold the
// async clipboard, and jsdom implements none of them.

async function writeClipboardText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // No clipboard to write to — a browser may withhold it, and a denied write is not an error
    // the menu can do anything about.
  }
}

export function copyText(text: string): void {
  if (!text) return;
  void writeClipboardText(text);
}

async function readClipboardText(): Promise<string> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return '';
  }
}

// A `paste` event is what reaches a surface that owns its own pasting — the editor takes the text
// off the event and inserts it into its model, a terminal writes it to the pty — so the event goes
// first and its outcome decides the rest. Returns false when nothing handled it.
function dispatchPasteEvent(element: HTMLElement, text: string): boolean {
  if (typeof ClipboardEvent !== 'function' || typeof DataTransfer !== 'function') return false;
  const data = new DataTransfer();
  data.setData('text/plain', text);
  const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
  if (!event.clipboardData) return false;
  element.dispatchEvent(event);
  return event.defaultPrevented;
}

// An ordinary field cancels nothing, so the text is inserted at its caret. `insertText` rather than
// an assignment to `.value`: it produces the input event a controlled React field needs to see, and
// it leaves the field's own undo history intact.
function insertAtCaret(text: string): void {
  if (typeof document.execCommand !== 'function') return;
  document.execCommand('insertText', false, text);
}

export async function pasteInto(element: HTMLElement): Promise<void> {
  element.focus();
  const text = await readClipboardText();
  if (!text) return;
  if (dispatchPasteEvent(element, text)) return;
  insertAtCaret(text);
}
