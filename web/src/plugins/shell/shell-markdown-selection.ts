export function copyShellMarkdownSelection(
  event: KeyboardEvent,
  shellBody: HTMLElement,
  copyText: (text: string) => void,
): boolean {
  const copyChord = event.metaKey && event.key.toLowerCase() === 'c'
    || event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'c';
  if (!copyChord) return false;

  const selection = globalThis.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  const isShellReplySelected = [...shellBody.querySelectorAll('.shell-output-block')]
    .some((block) => block.contains(selection.anchorNode));
  if (!isShellReplySelected) return false;

  event.preventDefault();
  event.stopPropagation();
  copyText(selection.toString());
  return true;
}
