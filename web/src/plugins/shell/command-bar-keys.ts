import { copySelectionChord, isMacPlatform } from '../api';
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

export function handleCompletionDismissKey(
  event: { key: string; preventDefault(): void },
  choicesVisible: boolean,
  clearChoices: () => void,
): boolean {
  if (event.key !== 'Escape' || !choicesVisible) return false;
  event.preventDefault();
  clearChoices();
  return true;
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

// A drag over the terminal ends in a click, and a click hands the keyboard back to the bar, so the
// terminal's copy chord for what the drag selected arrives here rather than at the terminal. A
// selection in the bar's own text keeps the chord, as it would in any text field.
export function handleTerminalCopyKey(
  event: KeyboardEvent,
  element: HTMLTextAreaElement | null,
  terminalSelection: () => string,
  copyText: (text: string) => void,
): boolean {
  if (!copySelectionChord(event, isMacPlatform())) return false;
  if (element && selectionIn(element)) return false;
  const text = terminalSelection();
  if (!text) return false;
  copyText(text);
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
