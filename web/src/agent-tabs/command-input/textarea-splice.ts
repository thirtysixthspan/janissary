// Splice `text` into a textarea at the current caret, or over the current selection. Prefers
// `execCommand` — it mutates the DOM directly, fires a real `input` event, and keeps a normal
// undo entry — falling back to manually mutating the element and dispatching `input` ourselves
// where it's unavailable (jsdom doesn't implement it at all). Either way the caret lands right
// after the inserted text, synchronously — no `requestAnimationFrame` round-trip, so a fast
// typist's next keystroke lands in the right spot.
//
// `value` is React's copy of the textarea's contents: it backs the fallback splice, and stands in
// as the caret position when the element reports none.
export function spliceIntoTextarea(element: HTMLTextAreaElement, value: string, text: string) {
  const start = element.selectionStart ?? value.length;
  const end = element.selectionEnd ?? value.length;
  if (typeof document.execCommand === 'function') {
    element.setSelectionRange(start, end);
    document.execCommand('insertText', false, text);
    return;
  }
  element.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
  element.selectionStart = element.selectionEnd = start + text.length;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}
