// Chord canonicalization and matching, and the core chords an overlay plugin may not claim.
//
// Pure: it takes only the key fields of a keydown, so the whole resolution path is unit-testable
// without a render. The chord-id shape is the editor-plugin family's (`../editor/plugins/chords.ts`)
// because it answers the same question the same way; the two are separate modules rather than one
// shared helper because a tab plugin's chord and an editor plugin's chord have nothing else in
// common, and the overlay family must not be able to reach into the editor's.

import { appChordAction } from '../shared/app-chords';
import type { OverlayChord, OverlayPluginDeclaration } from './api';

// A chord's canonical identity, used both to detect two plugins claiming the same chord and to match
// a keydown against the table. Modifiers are emitted in a fixed order so the same chord written two
// ways is one id.
export function overlayChordId(chord: OverlayChord): string {
  const modifiers = [
    chord.meta === true ? 'meta' : '',
    chord.ctrl === true ? 'ctrl' : '',
    chord.shift === true ? 'shift' : '',
    chord.alt === true ? 'alt' : '',
  ].filter(Boolean);
  return [...modifiers, chord.key.toLowerCase()].join('+');
}

// Every chord a declaration claims: the primary chord first, then the alternates in the order written.
// The one reading of a declaration's chords, so validation, the core-chord refusal, and the published
// claims cannot disagree about which chords a plugin holds.
export function declarationChords(
  declaration: Pick<OverlayPluginDeclaration, 'chord' | 'alternateChords'>,
): OverlayChord[] {
  return [declaration.chord, ...(declaration.alternateChords ?? [])];
}

export type ChordEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

// A chord's id from a keydown. This exists because the two shapes are not interchangeable and nothing
// in the type system says so: a `KeyboardEvent` carries `metaKey`/`ctrlKey`/`shiftKey`/`altKey`,
// while a chord carries `meta`/`ctrl`/`shift`/`alt`. Passing an event straight to `overlayChordId`
// type-checks — every modifier is optional — and silently reads all four as absent.
export function eventChordId(event: ChordEvent): string {
  return overlayChordId({
    key: event.key,
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
  });
}

// Whether the application already claims this chord and never yields it. An overlay plugin whose chord
// the core owns could never open, so the host reports it once rather than leaving it silently dead —
// the same rule the editor host applies to a binding the editor table claims.
//
// The answer comes from the one table of owned chords rather than from a second listing of the key
// handler's bindings, which is what drifted before: it omitted Cmd+T, which the handler does dispatch,
// and treated Shift+Tab as a global chord when only a section dialog claims it.
export function claimedByCore(chord: OverlayChord): boolean {
  return appChordAction(overlayChordId(chord)) !== undefined;
}
