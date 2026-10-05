// The overlay-plugin contract: what a plugin declares, what the host hands it, and what it may
// answer. Versioned on its own, like the tab and editor plugin families, because it is a third
// contract with a different shape and a different owner from either of them.
//
// A plugin here contributes a floating overlay — the popup that floats above the command line —
// rather than owning a tab or binding a chord inside an editor. That is the one thing neither
// existing family could express, and it is why this family exists.
//
// Resolution, ordering, async semantics, and what "nothing" means are stated once per extension point
// rather than in a document nothing checks. What a plugin can return is stated here because the host
// branches on it.

import type { ContributedOverlay } from '../shared/contributed-overlays';

export const OVERLAY_PLUGIN_API_VERSION = 1;

// A modifier chord. Modifiers are optional and default to absent, so `{ key: 'v', ctrl: true }` is
// Ctrl+V and `{ key: 'v', ctrl: true, shift: true }` is a different chord from it.
export type OverlayChord = {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
};

// When the host loads and starts a plugin. `'open'`, the default, waits for the first chord, command
// word, or context-menu open, so an unused plugin costs nothing. `'startup'` starts it once the window
// mounts, for a plugin that has to observe something from launch to be any use when it is first opened.
// It is the broad trigger, so a declaration that asks for it says why beside the field.
export type OverlayPluginActivation = 'open' | 'startup';

export type OverlayPluginDeclaration = {
  id: string;
  version: string;
  apiVersion: number;
  // The chord that opens the overlay, and the command word that does the same thing from the command
  // bar. A core chord or a command colliding with a built-in or another plugin's is a recorded
  // refusal that disables this plugin — never a throw, so one bad declaration leaves the rest working.
  chord: OverlayChord;
  // Further chords that open the same overlay — the Cmd form of a Ctrl chord, say. Each is checked and
  // refused on exactly the same terms as `chord`, and any one of them colliding disables the plugin.
  alternateChords?: readonly OverlayChord[];
  command: string;
  // What the overlay's own title row reads.
  title: string;
  // What the overlay shows when it has nothing to show, in the `(…)` shape the built-in pickers use.
  emptyText: string;
  // Absent means `'open'`.
  activation?: OverlayPluginActivation;
};

// What one row of the overlay represents. `text` is everything the user copied and is what gets
// pasted; `label` is the display derivation, which for the clipboard popup is the first line of
// non-space text and never the whole thing.
export type OverlayPluginItem = {
  id: string;
  label: string;
  text: string;
};

export type OverlayPluginItems = {
  items: readonly OverlayPluginItem[];
  // Which row the Return key and a click act on. The host owns nothing here: the plugin keeps its own
  // selection, because the selection is part of the overlay's own state rather than the host's.
  selected: number;
  // The number of entries the host's configuration allows this overlay to keep.
  maxEntries: number;
};

// What the host hands a plugin. Deliberately three things: the capability that can act on the world,
// the one number the host owns that a plugin cannot derive, and the one way back out — nothing else.
// No client, no tabs, no host internals, no importable module.
export type OverlayPluginCapabilities = {
  // Put `text` at the keyboard caret. `anchor` is the element a right-click landed on when the
  // overlay was opened from the context menu, or null for every other route in.
  paste: (text: string, anchor: HTMLElement | null) => void;
  // How many entries this overlay may keep, from the host's configuration. Read it when it is needed
  // rather than once at `start`: the configuration arrives after the window mounts, so a plugin that
  // activates at startup sees the default here first and the configured number afterwards.
  maxEntries: number;
  // Close this overlay. The one action a plugin needs that is not about the outside world: it is how
  // choosing an entry ends, and how Escape ends. Given as a capability rather than imported from the
  // seam so a plugin never has to reach the host's own registry to put itself away.
  close: () => void;
};

// What the host supplies once, at construction: everything except `close`, which is per-plugin and
// bound to that plugin's own name by the host.
export type OverlayPluginGrants = Omit<OverlayPluginCapabilities, 'close'>;

// What `start` returns: the overlay the host publishes in the shared seam. The plugin names the shape
// and the host stores it, so nothing here has to know how an overlay is rendered or reached — only
// that one exists.
export type OverlayPluginModule = {
  // Called once, before anything can open the overlay, and returns what the host registers. Anything
  // the plugin acquired — a subscription above all — is released by `dispose`.
  //
  // Once per activation, and a plugin does not have to guard against a second call: when two openers ask
  // for a plugin whose chunk is still loading, the host has the second join the first attempt rather than
  // begin its own, so `start` cannot run twice for one activation. A later activation after a `dispose`
  // calls it again, which is what makes `dispose` releasing what `start` acquired meaningful.
  start: (capabilities: OverlayPluginCapabilities) => ContributedOverlay;
  dispose: () => void;
};

export type OverlayPluginLoader = () => Promise<{ default: OverlayPluginModule }>;

// The built-in overlays' own key rule, published on the same terms as the picker's: an overlay's rows
// move clamped at both ends with no wraparound, Return chooses, and Escape closes. A plugin that
// wrote its own arrow handling would be the drift the shared rule exists to prevent, and this way
// `handlePickerKey` stays the one definition of what a modal list does with the keyboard.
export { handlePickerKey } from '../shared/picker-keyboard';
