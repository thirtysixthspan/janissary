// The chords the application already owns, and what each one does.
//
// One table with two readers, because "which chords does the app own?" was being answered twice: the window key
// handler acted on the bindings, and the overlay-plugin host kept a hand-written list of them so it could refuse a
// plugin whose chord could never fire. The two lists had already drifted — Cmd+T was handled but unreserved, and
// Shift+Tab was reserved as though it were global when only a section dialog claims it — so the second copy is
// removed rather than corrected in place.
//
// Ids are canonical chord ids in the shape `overlay-plugins/chords.ts` writes: modifiers in the fixed order
// meta, ctrl, shift, alt, then the lowercased key. They are written out here rather than derived because the plugin
// family may not import this module, and that module owns the formatter. `useWindowKeys.test.ts` pins the format by
// dispatching each chord here and asserting the handler answers it.
//
// `owner` says which module dispatches the chord. The host reserves a chord whatever dispatches it; the window
// handler routes only the ones it owns, and declines the rest out loud rather than leaving them unmentioned.

export type AppChordAction =
  | 'history'
  | 'tabNav'
  | 'queue'
  | 'tasks'
  | 'transcriptSearch'
  | 'projectSearch'
  | 'quickOpen'
  | 'newAgentTab'
  | 'sectionNav';

export type AppChordOwner = 'window' | 'sectionNav';

export const APP_CHORDS: Readonly<Record<string, { action: AppChordAction; owner: AppChordOwner }>> = {
  'ctrl+r': { action: 'history', owner: 'window' },
  'ctrl+g': { action: 'tabNav', owner: 'window' },
  'ctrl+e': { action: 'queue', owner: 'window' },
  'ctrl+a': { action: 'tasks', owner: 'window' },
  'meta+f': { action: 'transcriptSearch', owner: 'window' },
  'meta+shift+f': { action: 'projectSearch', owner: 'window' },
  'meta+p': { action: 'quickOpen', owner: 'window' },
  'meta+t': { action: 'newAgentTab', owner: 'window' },
  // Claimed only when the key lands inside an element marked `data-claims-shift-tab`, which is how
  // `useSectionNav` wraps focus in a dialog. Reserving it is still right: a plugin binding it would work
  // sometimes and do nothing the rest of the time.
  'shift+tab': { action: 'sectionNav', owner: 'sectionNav' },
};

// `Object.hasOwn` rather than a bare index, so a chord id that happens to name a prototype member —
// `constructor`, `toString` — cannot resolve to a function through the prototype chain.
export function appChordAction(chordId: string): AppChordAction | undefined {
  return Object.hasOwn(APP_CHORDS, chordId) ? APP_CHORDS[chordId]?.action : undefined;
}
