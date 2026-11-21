import { isClipboardChord, isPickerChord, isTabSwitchChord, isNewShellChord } from '../shared/terminal/window-chords';

// Returns true to send to PTY, false to bubble (switch tabs, open task/nav picker, drive whichever
// picker overlay is open over this tab).
export function harnessKeyFilter(e: KeyboardEvent, taskPickerOpen: boolean, navOpen: boolean): boolean {
  if (e.type !== 'keydown') return true;
  if (taskPickerOpen || navOpen) return false;
  return !(isTabSwitchChord(e) || isPickerChord(e) || isClipboardChord(e) || isNewShellChord(e));
}
