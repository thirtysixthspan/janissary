// The file navigator's location cycle: where the header's location button sends the tree next, and
// what its tooltip says. Unlike the left↔right toggle in `shared/dock-cycle.ts`, this cycle passes
// through the center tab strip — left sidebar → center → right sidebar → left. `null` is the center
// strip, matching the `setDock` RPC's undock value.

export type NavigatorLocation = 'left' | 'right' | null;

export function nextLocation(dock?: 'left' | 'right'): NavigatorLocation {
  if (dock === 'left') return null;
  if (dock === 'right') return 'left';
  return 'right';
}

export function locationTooltip(next: NavigatorLocation): string {
  if (next === null) return 'Move to center tab strip';
  return next === 'left' ? 'Move to left sidebar' : 'Move to right sidebar';
}
