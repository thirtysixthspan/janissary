// The one ordered list of the modal overlays that float above the command bar, and the two questions
// asked of it. Before this existed the order was restated in three places — the render chain in
// `PickerOverlays`, the keyboard priority chain in `useWindowKeys`, and the command-bar suppression
// flag in `AppMain` — and they had already stopped agreeing.
//
// Only one overlay is ever up at a time; position in `OVERLAYS` is priority, highest first.

export type OverlayName =
  | 'route'
  | 'syntaxTheme'
  | 'appTheme'
  | 'quickOpen'
  | 'tabNav'
  | 'history'
  | 'queue'
  | 'task'
  | 'profile';

export type OverlayOpenState = Record<OverlayName, boolean>;

type OverlayDescriptor = {
  name: OverlayName;
  // Whether this overlay takes the command bar's keys while it is open. True for all but the queue
  // picker: the queue's selected command is edited *in* the command bar — typing there rewrites the
  // queued entry, and only Enter, the arrows, and Backspace/Delete on an empty line are reserved —
  // so suppressing the bar for it would make the popup read-only. Recorded here, with its reason,
  // rather than left as an unexplained omission from a separate list.
  claimsCommandBar: boolean;
};

export const OVERLAYS: readonly OverlayDescriptor[] = [
  { name: 'route', claimsCommandBar: true },
  { name: 'syntaxTheme', claimsCommandBar: true },
  { name: 'appTheme', claimsCommandBar: true },
  { name: 'quickOpen', claimsCommandBar: true },
  { name: 'tabNav', claimsCommandBar: true },
  { name: 'history', claimsCommandBar: true },
  { name: 'queue', claimsCommandBar: false },
  { name: 'task', claimsCommandBar: true },
  { name: 'profile', claimsCommandBar: true },
];

// The overlay on screen, or `undefined` when none is. The same answer serves the render and the
// keyboard priority chain, which is what stops the two from drifting.
export function firstOpenOverlay(state: OverlayOpenState): OverlayName | undefined {
  return OVERLAYS.find((overlay) => state[overlay.name])?.name;
}

// Whether an overlay currently owns the command bar's keys, so the bar stops handling its own.
export function commandBarSuppressed(state: OverlayOpenState): boolean {
  return OVERLAYS.some((overlay) => state[overlay.name] && overlay.claimsCommandBar);
}
