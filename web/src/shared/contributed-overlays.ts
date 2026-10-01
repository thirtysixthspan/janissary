import type { ReactNode } from 'react';

// Where a plugin that contributes a floating overlay publishes it, so the pickers, the window key
// handler, the command bar, and the context menu can all reach one without any of them importing the
// plugin layer.
//
// This is `drop-registry.ts` in a second costume, and for the same reason. The feature-directory lint
// zones forbid `agent-tabs`, `context-menu`, and `pickers` from importing each other *or* from
// `overlay-plugins`, and a static import of a plugin's chunk here would pull it into the entry
// bundle. So the seam carries the three questions a feature needs to ask — which overlay claims this
// chord, which claims this command word, and open that one — and the plugin layer answers them from
// the outside by installing an opener. A feature names a chord or a command word; it never learns
// that a plugin exists, and never loads one itself.
//
// The open state lives here rather than in the projections the nine built-in overlays carry: an
// overlay's being open is the plugin's own state, not app state every consumer must be threaded
// through, and a second source of truth for it would be the drift `overlay-registry.ts` exists to end.

export type ContributedOverlay = {
  // Also its overlay name: a plugin's id, which is what the registry's union widens to include.
  name: string;
  // Whether this overlay takes the command bar's keys while it is open. The same bit the built-in
  // overlay registry records per overlay, and the same reason it is data rather than an omission from
  // a separate list.
  claimsCommandBar: boolean;
  // Renders the overlay. `anchor` is the element a right-click landed on when the overlay was opened
  // from the context menu, or null when it was opened by its chord or command word. It is handed in
  // here rather than read back by the plugin, because the plugin cannot import this module at
  // runtime and because the host is the only party that knows how the overlay was opened.
  render: (anchor: HTMLElement | null) => ReactNode;
  onKey: (event: KeyboardEvent) => void;
  // Called when the overlay opens, so the plugin can put its selection where a first-time open wants
  // it. The host knows nothing about selection.
  onOpen: () => void;
};

// How an overlay is reached, resolved by the host from its declaration and published here so that
// nothing but the host has to know a plugin exists.
export type OverlayClaims = {
  // Canonical chord ids, as `overlay-plugins/chords.ts` writes them.
  chords: readonly string[];
  command: string;
};

type Registration = {
  overlay: ContributedOverlay;
  claims: OverlayClaims;
  open: boolean;
  anchor: HTMLElement | null;
};

const registrations = new Map<string, Registration>();
const listeners = new Set<() => void>();
let version = 0;
let opener: ((name: string, anchor: HTMLElement | null) => void) | null = null;

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function registerContributedOverlay(
  overlay: ContributedOverlay, claims: OverlayClaims,
): () => void {
  registrations.set(overlay.name, { overlay, claims, open: false, anchor: null });
  notify();
  // The removal leaves a later registration under the same name in place, so a remount's cleanup
  // ordering cannot drop a successor's.
  return () => { registrations.delete(overlay.name); notify(); };
}

// The host installs this once: it is what loads a plugin's chunk and then opens it. Keeping it here
// rather than passing a host reference around is what lets a feature open an overlay without holding
// a reference to the plugin layer.
export function installOverlayOpener(open: (name: string, anchor: HTMLElement | null) => void): () => void {
  opener = open;
  return () => { if (opener === open) opener = null; };
}

export function subscribeContributedOverlays(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// The store snapshot for `useSyncExternalStore`: a number rather than a derived array, so the value is
// stable between changes and the hook re-renders exactly when something registered or opened.
export function contributedOverlaysVersion(): number {
  return version;
}

// Registration order, so two plugins claiming the same moment resolve the same way every time.
export function contributedOverlays(): readonly ContributedOverlay[] {
  return [...registrations.values()].map((entry) => entry.overlay);
}

// The open one, or undefined. Contributed overlays rank after every built-in overlay, so this is only
// asked once the registry has established that no core overlay is up.
export function contributedOverlayOnScreen(): ContributedOverlay | undefined {
  for (const entry of registrations.values()) if (entry.open) return entry.overlay;
  return undefined;
}

export function isContributedOverlayOpen(name: string): boolean {
  return registrations.get(name)?.open ?? false;
}

export function contributedOverlayClaimsCommandBar(): boolean {
  return [...registrations.values()].some((entry) => entry.open && entry.overlay.claimsCommandBar);
}

// The element a right-click landed on when the overlay was opened from the context menu, or null when
// it was opened by its chord or command word. Captured at open time rather than resolved later,
// because the menu closes and hands focus back before anything can act on it.
export function contributedOverlayAnchor(name: string): HTMLElement | null {
  return registrations.get(name)?.anchor ?? null;
}

function claimForCommand(command: string): string | null {
  const wanted = command.toLowerCase();
  for (const entry of registrations.values()) {
    if (entry.claims.command.toLowerCase() === wanted) return entry.overlay.name;
  }
  return null;
}

function claimForChord(chordId: string): string | null {
  for (const entry of registrations.values()) {
    if (entry.claims.chords.includes(chordId)) return entry.overlay.name;
  }
  return null;
}

// Whether this command word opens a contributed overlay. True synchronously so a caller can return
// without dispatching the command to the server; opening it, which may fetch a chunk, happens after.
export function overlayClaimedByCommand(command: string): boolean {
  return claimForCommand(command) !== null;
}

export function openOverlayForCommand(command: string, anchor: HTMLElement | null): boolean {
  const name = claimForCommand(command);
  if (!name || !opener) return false;
  opener(name, anchor);
  return true;
}

export function openOverlayForChord(chordId: string): boolean {
  const name = claimForChord(chordId);
  if (!name || !opener) return false;
  opener(name, null);
  return true;
}

export function openContributedOverlay(name: string, anchor: HTMLElement | null): boolean {
  const entry = registrations.get(name);
  if (!entry) return false;
  entry.open = true;
  entry.anchor = anchor;
  entry.overlay.onOpen();
  notify();
  return true;
}

export function closeContributedOverlay(name: string): void {
  const entry = registrations.get(name);
  if (!entry?.open) return;
  entry.open = false;
  entry.anchor = null;
  notify();
}
