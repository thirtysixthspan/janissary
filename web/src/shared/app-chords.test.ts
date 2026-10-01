import { describe, expect, it } from 'vitest';
import { APP_CHORDS, appChordAction } from './app-chords';

// The table the window key handler routes on and the overlay-plugin host reads to refuse a chord. It
// exists because "which chords does the app own?" used to be answered twice, and the two answers had
// drifted: the hand-written list omitted Cmd+T, which the handler does dispatch.

describe('the application chord table', () => {
  it('answers for every chord it declares', () => {
    for (const [id, entry] of Object.entries(APP_CHORDS)) {
      expect(appChordAction(id)).toBe(entry.action);
    }
  });

  it('answers for nothing else, including a prototype member name', () => {
    expect(appChordAction('ctrl+shift+v')).toBeUndefined();
    expect(appChordAction('nonsense')).toBeUndefined();
    // A bare index would resolve these through the prototype chain.
    expect(appChordAction('constructor')).toBeUndefined();
    expect(appChordAction('toString')).toBeUndefined();
  });

  it('writes each id in the shape the plugin family canonicalizes to', () => {
    // meta, ctrl, shift, alt in that fixed order, then the lowercased key — the shape
    // `overlay-plugins/chords.ts` produces, which the plugin family may not import this module to use.
    for (const id of Object.keys(APP_CHORDS)) {
      expect(id).toMatch(/^(meta\+|ctrl\+|shift\+|alt\+)*[a-z0-9]+$/);
    }
  });

  it('gives every chord one owner, and reserves the chords another module dispatches', () => {
    // Shift+Tab is reserved even though the window handler does not dispatch it: `useSectionNav` claims
    // it inside a dialog, so a plugin binding it would work sometimes and do nothing the rest of the time.
    expect(APP_CHORDS['shift+tab']).toEqual({ action: 'sectionNav', owner: 'sectionNav' });
    expect(appChordAction('shift+tab')).toBe('sectionNav');
  });
});
