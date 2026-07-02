import type { RouteChooserView } from '@shared/protocol';

export function handleRouteChooserKey(
  e: KeyboardEvent,
  route: RouteChooserView,
  routeIdx: number,
  setRouteIndex: (setter: (prev: number) => number) => void,
  chooseRoute: (index: number) => void,
): boolean {
  switch (e.key) {
  case 'ArrowUp': { e.preventDefault(); setRouteIndex((index) => Math.max(0, index - 1)); return true; }
  case 'ArrowDown': { e.preventDefault(); setRouteIndex((index) => Math.min(route.choices.length - 1, index + 1)); return true; }
  case 'Enter': { e.preventDefault(); chooseRoute(routeIdx); return true; }
  case 'Escape': { e.preventDefault(); chooseRoute(-1); return true; }
  }
  return false;
}

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
