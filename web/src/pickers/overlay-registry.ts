// The one ordered list of the modal overlays that float above the command bar, and the two questions
// asked of it. Before this existed the order was restated in three places — the render chain in
// `PickerOverlays`, the keyboard priority chain in `useWindowKeys`, and the command-bar suppression
// flag in `AppMain` — and they had already stopped agreeing.
//
// Only one overlay is ever up at a time; position in `OVERLAYS` is priority, highest first.

import type { RouteChooserView } from '@shared/protocol';

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

// The nine pieces of app state that decide whether each overlay is up, under the names `App.tsx`
// gives them. Naming them here is what lets `buildOverlayOpenState` be the only place the app's
// vocabulary is translated into the registry's — before this the same nine-field literal was spelled
// out at every site that asked the registry a question, and the close-tab chord answered from a
// shorter, hand-ORed fourth version that had never learned four of the overlays exist.
export type OverlayOpenSources = {
  route: RouteChooserView | null;
  themePickerOpen: boolean;
  appThemePickerOpen: boolean;
  quickOpenOpen: boolean;
  navOpen: boolean;
  pickerOpen: boolean;
  queueOpen: boolean;
  taskPickerOpen: boolean;
  profilePickerOpen: boolean;
};

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

// The one translation from app state to overlay names. Every consumer reads the object this
// returns, so a tenth overlay added to `OverlayName` fails to compile here until it is mapped, and
// then fails at each caller until the state behind it is supplied.
export function buildOverlayOpenState(sources: OverlayOpenSources): OverlayOpenState {
  return {
    route: sources.route !== null,
    syntaxTheme: sources.themePickerOpen,
    appTheme: sources.appThemePickerOpen,
    quickOpen: sources.quickOpenOpen,
    tabNav: sources.navOpen,
    history: sources.pickerOpen,
    queue: sources.queueOpen,
    task: sources.taskPickerOpen,
    profile: sources.profilePickerOpen,
  };
}

// The overlay on screen, or `undefined` when none is. The same answer serves the render and the
// keyboard priority chain, which is what stops the two from drifting.
export function firstOpenOverlay(state: OverlayOpenState): OverlayName | undefined {
  return OVERLAYS.find((overlay) => state[overlay.name])?.name;
}

// Whether an overlay currently owns the command bar's keys, so the bar stops handling its own.
export function commandBarSuppressed(state: OverlayOpenState): boolean {
  return OVERLAYS.some((overlay) => state[overlay.name] && overlay.claimsCommandBar);
}
