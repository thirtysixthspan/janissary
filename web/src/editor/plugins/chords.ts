// Chord canonicalization and matching. Pure: takes only the key fields of a keydown, so the whole
// resolution path is unit-testable without a render.

import { actionForKey, type KeyLike } from '../keys';
import type { BoundBinding, EditorChord } from './api';

// A chord's canonical identity, used both to detect two plugins claiming the same chord and to match
// a keydown against the table. Modifiers are emitted in a fixed order so the same chord written two
// ways — `{ key: '/', meta: true }` and `{ key: '/', meta: true, shift: false }` — is one id.
export function chordId(chord: EditorChord): string {
  const modifiers = [
    chord.meta === true ? 'meta' : '',
    chord.ctrl === true ? 'ctrl' : '',
    chord.shift === true ? 'shift' : '',
    chord.alt === true ? 'alt' : '',
  ].filter(Boolean);
  return [...modifiers, chord.key.toLowerCase()].join('+');
}

export function eventChordId(event: KeyLike): string {
  return chordId({
    key: event.key,
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
  });
}

export function hasModifier(chord: EditorChord): boolean {
  return chord.meta === true || chord.ctrl === true;
}

export function matchBinding(
  bindings: readonly BoundBinding[], event: KeyLike,
): BoundBinding | null {
  const id = eventChordId(event);
  return bindings.find((binding) => chordId(binding.chord) === id) ?? null;
}

// Whether the core editor table already claims this chord. Such a binding could never fire, since
// the plugin path is only consulted where `actionForKey` answers null, so the host reports it once
// rather than leaving it silently dead.
export function claimedByCore(chord: EditorChord): boolean {
  return actionForKey({
    key: chord.key,
    metaKey: chord.meta === true,
    ctrlKey: chord.ctrl === true,
    shiftKey: chord.shift === true,
    altKey: chord.alt === true,
  }) !== null;
}
