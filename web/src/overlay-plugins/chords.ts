// Chord canonicalization and matching, and the core chords an overlay plugin may not claim.
//
// Pure: it takes only the key fields of a keydown, so the whole resolution path is unit-testable
// without a render. The chord-id shape is the editor-plugin family's (`../editor/plugins/chords.ts`)
// because it answers the same question the same way; the two are separate modules rather than one
// shared helper because a tab plugin's chord and an editor plugin's chord have nothing else in
// common, and the overlay family must not be able to reach into the editor's.

import type { OverlayChord } from './api';

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

// Whether the window key handler already claims this chord and never yields it. An overlay plugin
// whose chord the core owns could never open, so the host reports it once rather than leaving it
// silently dead — the same rule the editor host applies to a binding the editor table claims.
export function claimedByCore(chord: OverlayChord): boolean {
  const key = chord.key.toLowerCase();
  if (chord.ctrl === true && !chord.shift && !chord.alt && !chord.meta) {
    return ['r', 'g', 'e', 'a'].includes(key);
  }
  if (chord.meta === true && !chord.shift && !chord.alt && !chord.ctrl) {
    // Cmd+P is Quick Open and Cmd+F is the transcript search; both are claimed outright, and Cmd+F
    // matches on the key alone so Cmd+Shift+F is claimed by the same branch.
    return ['p', 'f'].includes(key);
  }
  if (chord.meta === true && chord.shift && !chord.alt && !chord.ctrl) {
    return ['f'].includes(key);
  }
  if (chord.shift === true && !chord.ctrl && !chord.alt && !chord.meta) {
    return ['tab'].includes(key);
  }
  return false;
}
