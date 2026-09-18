import { describe, expect, it } from 'vitest';
import {
  nextSessionSelection, openIntentFor, relativeActivity, sessionClickSelection,
} from './sessions-keys';

describe('sessionClickSelection', () => {
  // Opening with the mouse always takes a second click, including on the first row, which is current
  // from the moment the list opens.
  it('moves the current row on a first click and opens on a second click of the same row', () => {
    expect(sessionClickSelection(0, null)).toEqual({ selected: 0, opens: false });
    expect(sessionClickSelection(0, 0)).toEqual({ selected: 0, opens: true });
  });

  it('does not open when the click lands on a different row', () => {
    expect(sessionClickSelection(2, 0)).toEqual({ selected: 2, opens: false });
  });
});

describe('nextSessionSelection', () => {
  it('moves down and up without wrapping past either end', () => {
    expect(nextSessionSelection(3, 0, 'ArrowDown')).toBe(1);
    expect(nextSessionSelection(3, 2, 'ArrowDown')).toBe(2);
    expect(nextSessionSelection(3, 1, 'ArrowUp')).toBe(0);
    expect(nextSessionSelection(3, 0, 'ArrowUp')).toBe(0);
  });

  it('jumps to the ends on Home and End', () => {
    expect(nextSessionSelection(3, 2, 'Home')).toBe(0);
    expect(nextSessionSelection(3, 0, 'End')).toBe(2);
  });

  it('selects nothing in an empty list, and ignores any other key', () => {
    expect(nextSessionSelection(0, null, 'ArrowDown')).toBeNull();
    expect(nextSessionSelection(3, 1, 'PageDown')).toBe(1);
  });
});

describe('openIntentFor', () => {
  it.each(['active', 'reconnecting', 'provisioning'])('focuses a %s row', (state) => {
    expect(openIntentFor(state, ['focus', 'detach'])).toBe('focus');
  });

  it('reattaches a detached row', () => {
    expect(openIntentFor('detached', ['reattach', 'end'])).toBe('reattach');
  });

  // Nothing is left out there to focus or come back to.
  it('does nothing on an ended row', () => {
    expect(openIntentFor('ended', ['forget'])).toBeUndefined();
  });

  it('does nothing when the row does not offer the verb opening would use', () => {
    expect(openIntentFor('active', [])).toBeUndefined();
    expect(openIntentFor('detached', ['forget'])).toBeUndefined();
  });
});

describe('relativeActivity', () => {
  const NOW = 1_000_000_000;

  it.each([
    { elapsed: 0, text: 'just now' },
    { elapsed: 59_000, text: 'just now' },
    { elapsed: 3 * 60_000, text: '3m ago' },
    { elapsed: 2 * 60 * 60_000, text: '2h ago' },
    { elapsed: 3 * 24 * 60 * 60_000, text: '3d ago' },
  ])('renders $elapsed ms ago as $text', ({ elapsed, text }) => {
    expect(relativeActivity(NOW - elapsed, NOW)).toBe(text);
  });

  // A stamp from a clock that ran ahead reads as now rather than as a negative age.
  it('never reports a future stamp as negative', () => {
    expect(relativeActivity(NOW + 60_000, NOW)).toBe('just now');
  });
});
