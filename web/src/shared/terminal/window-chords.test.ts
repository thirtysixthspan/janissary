import { describe, it, expect } from 'vitest';
import { isPickerChord, isTabSwitchChord } from './window-chords';

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
