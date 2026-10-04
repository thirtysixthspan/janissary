export function insertCommandAtCaret(element: HTMLTextAreaElement, value: string, text: string): void {
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
