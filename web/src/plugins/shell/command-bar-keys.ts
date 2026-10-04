import { controlCharacterFor, type ControlKey } from './command-line-rules';

export function handleQueueKey(
  event: { key: string; preventDefault(): void },
  queueOpen: boolean,
  draft: string,
  onDeleteQueued?: () => void,
): boolean {
  if (!queueOpen) return false;
  if (['Enter', 'ArrowUp', 'ArrowDown'].includes(event.key)) return true;
  if ((event.key === 'Backspace' || event.key === 'Delete') && draft === '') {
    event.preventDefault();
    onDeleteQueued?.();
    return true;
  }
  return false;
}

export function handleShellControlKey(
  event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; preventDefault(): void },
  element: HTMLTextAreaElement | null,
  copyText: (text: string) => void,
  write: (data: string) => void,
): boolean {
  const control = controlKeyOf(event);
  if (!control) return false;
  const selection = element ? selectionIn(element) : '';
  const character = controlCharacterFor(control, Boolean(selection));
  if (character === undefined) {
    if (selection) copyText(selection);
  } else {
    write(character);
  }
  event.preventDefault();
  return true;
}

function controlKeyOf(event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): ControlKey | undefined {
  if (!event.ctrlKey || event.metaKey || event.shiftKey) return undefined;
  const key = event.key.toLowerCase();
  if (key === 'c') return 'ctrl+c';
  if (key === 'd') return 'ctrl+d';
  if (key === 'z') return 'ctrl+z';
  return undefined;
}

function selectionIn(element: HTMLTextAreaElement): string {
  return element.selectionStart === element.selectionEnd ? '' : element.value.slice(
    element.selectionStart, element.selectionEnd,
  );
}
