// Dock-cycle helpers shared by the dockable tab kinds (file navigator and notifications). The cycle
// order lives client-side: the dock-cycle button toggles left↔right only, never center. Center
// placement is reached via the bare command (`files` / `notifications`), not the button.

export function nextDock(current?: 'left' | 'right'): 'left' | 'right' {
  return current === 'left' ? 'right' : 'left';
}

export function dockTooltip(next: 'left' | 'right' | null): string {
  return next === 'left' ? 'Move to left sidebar' : 'Move to right sidebar';
}
