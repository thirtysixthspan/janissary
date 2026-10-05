// Shared by the app's built-in pickers and overlay plugins so modal list navigation follows one rule.
export function handlePickerKey(
  e: KeyboardEvent,
  items: string[],
  pickerIdx: number,
  setPickerIndex: (setter: (prev: number) => number) => void,
  runCommand: (cmd: string) => void,
  setPickerOpen: (open: boolean) => void,
): boolean {
  switch (e.key) {
  case 'ArrowUp': { e.preventDefault(); setPickerIndex((index) => Math.max(0, index - 1)); return true; }
  case 'ArrowDown': { e.preventDefault(); setPickerIndex((index) => Math.min(items.length - 1, index + 1)); return true; }
  case 'Enter': { e.preventDefault(); const command = items[pickerIdx]; if (command) runCommand(command); setPickerOpen(false); return true; }
  case 'Escape': { e.preventDefault(); setPickerOpen(false); return true; }
  }
  return false;
}
