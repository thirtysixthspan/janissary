import { describe, it, expect } from 'vitest';
import { isClipboardChord, isPickerChord, isTabSwitchChord } from './window-chords';

function keyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return { type: 'keydown', key: 'a', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...overrides } as KeyboardEvent;
}

describe('isTabSwitchChord', () => {
  it.each(['ArrowLeft', 'ArrowRight'])('accepts Shift+%s', (key) => {
    expect(isTabSwitchChord(keyEvent({ key, shiftKey: true }))).toBe(true);
  });

  it.each(['[', '{', ']', '}'])('accepts Cmd+Shift+%s', (key) => {
    expect(isTabSwitchChord(keyEvent({ key, metaKey: true, shiftKey: true }))).toBe(true);
  });

  it('rejects Ctrl+Shift+ArrowLeft', () => {
    expect(isTabSwitchChord(keyEvent({ key: 'ArrowLeft', ctrlKey: true, shiftKey: true }))).toBe(false);
  });

  it('rejects a plain ArrowLeft', () => {
    expect(isTabSwitchChord(keyEvent({ key: 'ArrowLeft' }))).toBe(false);
  });

  it('rejects Ctrl+ArrowLeft', () => {
    expect(isTabSwitchChord(keyEvent({ key: 'ArrowLeft', ctrlKey: true }))).toBe(false);
  });

  it('rejects Cmd+[ without Shift', () => {
    expect(isTabSwitchChord(keyEvent({ key: '[', metaKey: true }))).toBe(false);
  });

  it('rejects Shift+ArrowUp', () => {
    expect(isTabSwitchChord(keyEvent({ key: 'ArrowUp', shiftKey: true }))).toBe(false);
  });
});

describe('isPickerChord', () => {
  it.each(['a', 'A', 'g', 'G'])('accepts Ctrl+%s', (key) => {
    expect(isPickerChord(keyEvent({ key, ctrlKey: true }))).toBe(true);
  });

  it.each(['shiftKey', 'altKey', 'metaKey'] as const)('rejects Ctrl+A with %s', (modifier) => {
    expect(isPickerChord(keyEvent({ key: 'a', ctrlKey: true, [modifier]: true }))).toBe(false);
  });

  it.each(['r', 'e'])('rejects Ctrl+%s, which the terminal keeps', (key) => {
    expect(isPickerChord(keyEvent({ key, ctrlKey: true }))).toBe(false);
  });

  it('rejects a bare a', () => {
    expect(isPickerChord(keyEvent({ key: 'a' }))).toBe(false);
  });
});

describe('isClipboardChord', () => {
  // The clipboard popup is a plugin's, not a built-in overlay's, so its chord is matched by its own
  // declaration. What the terminal needs is only that the chord reaches the window at all.
  it.each(['v', 'V'])('accepts Ctrl+Shift+%s', (key) => {
    expect(isClipboardChord(keyEvent({ key, ctrlKey: true, shiftKey: true }))).toBe(true);
  });

  it.each(['altKey', 'metaKey'] as const)('rejects Ctrl+Shift+V with %s', (modifier) => {
    expect(isClipboardChord(keyEvent({ key: 'v', ctrlKey: true, shiftKey: true, [modifier]: true }))).toBe(false);
  });

  // The Cmd form is the plugin's alternate chord, and a harness tab has to let it reach the window too.
  it.each(['v', 'V'])('accepts Cmd+Shift+%s', (key) => {
    expect(isClipboardChord(keyEvent({ key, metaKey: true, shiftKey: true }))).toBe(true);
  });

  it('rejects Cmd+Shift+V with Alt', () => {
    expect(isClipboardChord(keyEvent({ key: 'v', metaKey: true, shiftKey: true, altKey: true }))).toBe(false);
  });

  // Cmd+V is the terminal's own paste and has to stay that.
  it('rejects Cmd+V without the shift', () => {
    expect(isClipboardChord(keyEvent({ key: 'v', metaKey: true }))).toBe(false);
  });

  // Plain Ctrl+V has to stay the browser's own paste in an editor buffer, which is why the shift is
  // part of the claim rather than an afterthought.
  it('rejects Ctrl+V without the shift', () => {
    expect(isClipboardChord(keyEvent({ key: 'v', ctrlKey: true }))).toBe(false);
  });

  it('is not one of the picker chords the terminal already let through', () => {
    expect(isPickerChord(keyEvent({ key: 'v', ctrlKey: true, shiftKey: true }))).toBe(false);
  });
});
