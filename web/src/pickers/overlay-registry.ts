// The one ordered list of the modal overlays that float above the command bar, and the two questions
// asked of it. Before this existed the order was restated in three places — the render chain in
// `PickerOverlays`, the keyboard priority chain in `useWindowKeys`, and the command-bar suppression
// flag in `AppMain` — and they had already stopped agreeing.
//
// Only one overlay is ever up at a time; position in `OVERLAYS` is priority, highest first. A plugin
// that contributes one ranks after all of these, so a built-in overlay always wins a tie and a chord
// pressed while one is up does nothing — which is what the overlay stack already promised about the
// shortcuts that open the others. A contributed overlay's own name is part of `OverlayName`, so the
// compile-time guarantee that a tenth overlay cannot be added without being mapped here still holds
// for a bundled plugin as well.

import type { RouteChooserView } from '@shared/protocol';
import { contributedOverlayClaimsCommandBar } from '../shared/contributed-overlays';

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
  // Whether the command bar is disabled outright while this overlay is open, not merely stripped of
  // its keys. True for the route chooser alone: it is the spec's one modal overlay — text typed
  // into the bar while it is open would never run, because Enter picks the route instead — so the
  // bar must not take text at all. The other overlays leave it enabled, as they always have.
  disablesCommandBar: boolean;
};

export const OVERLAYS: readonly OverlayDescriptor[] = [
  { name: 'route', claimsCommandBar: true, disablesCommandBar: true },
  { name: 'syntaxTheme', claimsCommandBar: true, disablesCommandBar: false },
  { name: 'appTheme', claimsCommandBar: true, disablesCommandBar: false },
  { name: 'quickOpen', claimsCommandBar: true, disablesCommandBar: false },
  { name: 'tabNav', claimsCommandBar: true, disablesCommandBar: false },
  { name: 'history', claimsCommandBar: true, disablesCommandBar: false },
  { name: 'queue', claimsCommandBar: false, disablesCommandBar: false },
  { name: 'task', claimsCommandBar: true, disablesCommandBar: false },
  { name: 'profile', claimsCommandBar: true, disablesCommandBar: false },
];

// The one translation from app state to overlay names. Every consumer reads the object this
// returns, so a tenth core overlay added to `CoreOverlayName` fails to compile here until it is
// mapped, and then fails at each caller until the state behind it is supplied. A contributed
// overlay's open flag is not in that record on purpose — it is the plugin's own state, read from the
// seam it registered with rather than threaded through every projection.
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

// The core overlay on screen, or `undefined` when none of the nine is. Unchanged in meaning, and
// deliberately still core-only: a caller that gets `undefined` knows no built-in overlay is up, and
// whether a plugin has contributed one is a separate question it asks the seam — which is what lets
// both `switch` chains keep their existing arms and gain one `default` each.
export function firstOpenOverlay(state: OverlayOpenState): OverlayName | undefined {
  return OVERLAYS.find((overlay) => state[overlay.name])?.name;
}

// Whether an overlay currently owns the command bar's keys, so the bar stops handling its own.
export function commandBarSuppressed(state: OverlayOpenState): boolean {
  if (OVERLAYS.some((overlay) => state[overlay.name] && overlay.claimsCommandBar)) return true;
  return contributedOverlayClaimsCommandBar();
}

// Whether an open overlay disables the command bar's textarea outright (see `disablesCommandBar`).
// No contributed overlay does: the clipboard popup inserts at the caret rather than replacing the
// line, so the bar has to stay live behind it.
export function commandBarDisabled(state: OverlayOpenState): boolean {
  return OVERLAYS.some((overlay) => state[overlay.name] && overlay.disablesCommandBar);
}

