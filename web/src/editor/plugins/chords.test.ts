import { describe, expect, it } from 'vitest';
import type { KeyLike } from '../keys';
import type { BoundBinding } from './api';
import { chordId, claimedByCore, eventChordId, matchBinding } from './chords';

const press = (key: string, modifiers: Partial<KeyLike> = {}): KeyLike => ({
  key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers,
});

const TOGGLE_COMMENT: BoundBinding = {
  plugin: 'commenting',
  command: 'toggle-comment',
  chord: { key: '/', meta: true },
  needs: 'selection',
};

describe('chordId', () => {
  it('treats the same chord written two ways as one id', () => {
    expect(chordId({ key: '/', meta: true }))
      .toBe(chordId({ key: '/', meta: true, shift: false, alt: false }));
  });

  it('lowercases the key so a declaration and a keydown agree', () => {
    expect(chordId({ key: 'K', ctrl: true })).toBe(chordId({ key: 'k', ctrl: true }));
  });

  it('emits modifiers in a fixed order regardless of declaration order', () => {
    expect(chordId({ key: 'k', shift: true, meta: true })).toBe('meta+shift+k');
  });

  it('distinguishes chords that differ only by a modifier', () => {
    expect(chordId({ key: '/', meta: true })).not.toBe(chordId({ key: '/', ctrl: true }));
    expect(chordId({ key: '/', meta: true })).not.toBe(chordId({ key: '/', meta: true, shift: true }));
  });

  it('derives the same id from a keydown as from the declaration', () => {
    expect(eventChordId(press('/', { metaKey: true }))).toBe(chordId({ key: '/', meta: true }));
  });
});

describe('matchBinding', () => {
  const table = [TOGGLE_COMMENT];

  it('matches the declared chord', () => {
    expect(matchBinding(table, press('/', { metaKey: true }))).toBe(TOGGLE_COMMENT);
  });

  it('does not match when an undeclared modifier is held', () => {
    expect(matchBinding(table, press('/', { metaKey: true, shiftKey: true }))).toBeNull();
    expect(matchBinding(table, press('/', { metaKey: true, altKey: true }))).toBeNull();
  });

  it('does not match a different key or a missing modifier', () => {
    expect(matchBinding(table, press('/', {}))).toBeNull();
    expect(matchBinding(table, press('k', { metaKey: true }))).toBeNull();
  });
});

describe('claimedByCore', () => {
  it('leaves Cmd+/ free, which is why a plugin may claim it', () => {
    expect(claimedByCore({ key: '/', meta: true })).toBe(false);
  });

  it('identifies a chord the core editor table already uses', () => {
    // Every one of these is a real binding in ../keys.ts, so a plugin claiming one could never fire.
    expect(claimedByCore({ key: 's', meta: true })).toBe(true);
    expect(claimedByCore({ key: 'z', meta: true })).toBe(true);
    expect(claimedByCore({ key: 'f', meta: true })).toBe(true);
    expect(claimedByCore({ key: 'k', ctrl: true })).toBe(true);
  });

  it('identifies a bare printable key, which the core table turns into an insert', () => {
    expect(claimedByCore({ key: '/' })).toBe(true);
  });

  it('leaves the yielded chords free, since the core table delegates rather than keeps them', () => {
    expect(claimedByCore({ key: 'Tab' })).toBe(false);
    expect(claimedByCore({ key: 'Tab', shift: true })).toBe(false);
  });
});
