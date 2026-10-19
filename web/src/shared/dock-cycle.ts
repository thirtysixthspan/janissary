// Dock-cycle helpers for the docked notifications, schedules, and plugin tabs. The cycle order lives
// client-side: the dock-cycle button toggles left↔right only, never center. Center placement is
// reached via the bare command (`notifications` / `schedules`), not the button. The file navigator
// has its own three-way cycle through the center strip — see `file-navigator/file/navigator-location.ts`.

export function nextDock(current?: 'left' | 'right'): 'left' | 'right' {
  return current === 'left' ? 'right' : 'left';
}

export function dockTooltip(next: 'left' | 'right' | null): string {
  return next === 'left' ? 'Move to left sidebar' : 'Move to right sidebar';
}
