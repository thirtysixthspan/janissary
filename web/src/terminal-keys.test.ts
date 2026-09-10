import { describe, it, expect } from 'vitest';
import { altArrowSequence, copySelectionChord, shiftEnterSequence } from './terminal-keys';

function keyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return { type: 'keydown', key: 'a', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...overrides } as KeyboardEvent;
}

describe('shiftEnterSequence', () => {
  it('translates Shift+Enter to ESC + CR', () => {
    expect(shiftEnterSequence(keyEvent({ key: 'Enter', shiftKey: true }))).toBe('\u{1B}\r');
  });

  it('leaves a plain Enter alone', () => {
    expect(shiftEnterSequence(keyEvent({ key: 'Enter' }))).toBeNull();
  });

  it.each(['ctrlKey', 'altKey', 'metaKey'] as const)('leaves Shift+Enter with %s alone', (modifier) => {
    expect(shiftEnterSequence(keyEvent({ key: 'Enter', shiftKey: true, [modifier]: true }))).toBeNull();
  });
});

describe('altArrowSequence', () => {
  it('translates Alt+ArrowLeft to ESC b on macOS', () => {
    expect(altArrowSequence(keyEvent({ key: 'ArrowLeft', altKey: true }), true)).toBe('\u{1B}b');
  });

  it('translates Alt+ArrowRight to ESC f on macOS', () => {
    expect(altArrowSequence(keyEvent({ key: 'ArrowRight', altKey: true }), true)).toBe('\u{1B}f');
  });

  it('translates Alt+ArrowLeft to the Ctrl+ArrowLeft sequence elsewhere', () => {
    expect(altArrowSequence(keyEvent({ key: 'ArrowLeft', altKey: true }), false)).toBe('\u{1B}[1;5D');
  });

  it('translates Alt+ArrowRight to the Ctrl+ArrowRight sequence elsewhere', () => {
    expect(altArrowSequence(keyEvent({ key: 'ArrowRight', altKey: true }), false)).toBe('\u{1B}[1;5C');
  });

  it('leaves an arrow key without Alt alone', () => {
    expect(altArrowSequence(keyEvent({ key: 'ArrowLeft' }), true)).toBeNull();
  });

  it.each(['ctrlKey', 'shiftKey', 'metaKey'] as const)('leaves Alt+ArrowLeft with %s alone', (modifier) => {
    expect(altArrowSequence(keyEvent({ key: 'ArrowLeft', altKey: true, [modifier]: true }), true)).toBeNull();
  });

  it('leaves Alt with a non-arrow key alone', () => {
    expect(altArrowSequence(keyEvent({ key: 'b', altKey: true }), true)).toBeNull();
  });
});

describe('copySelectionChord', () => {
  it.each([true, false])('matches Ctrl+Shift+C on every platform (isMac=%s)', (isMac) => {
    expect(copySelectionChord(keyEvent({ key: 'C', ctrlKey: true, shiftKey: true }), isMac)).toBe(true);
  });

  it('matches Cmd+C on macOS', () => {
    expect(copySelectionChord(keyEvent({ key: 'c', metaKey: true }), true)).toBe(true);
  });

  it('leaves Cmd+C alone elsewhere', () => {
    expect(copySelectionChord(keyEvent({ key: 'c', metaKey: true }), false)).toBe(false);
  });

  it('leaves a bare Ctrl+C alone so it stays the interrupt', () => {
    expect(copySelectionChord(keyEvent({ key: 'c', ctrlKey: true }), true)).toBe(false);
  });

  it('leaves an unmodified c alone', () => {
    expect(copySelectionChord(keyEvent({ key: 'c' }), true)).toBe(false);
  });

  it('leaves a chord on another letter alone', () => {
    expect(copySelectionChord(keyEvent({ key: 'v', ctrlKey: true, shiftKey: true }), true)).toBe(false);
  });

  it.each(['altKey', 'metaKey'] as const)('leaves Ctrl+Shift+C with %s alone', (modifier) => {
    expect(copySelectionChord(keyEvent({ key: 'C', ctrlKey: true, shiftKey: true, [modifier]: true }), true)).toBe(false);
  });

  it.each(['altKey', 'shiftKey'] as const)('leaves Cmd+C with %s alone', (modifier) => {
    expect(copySelectionChord(keyEvent({ key: 'c', metaKey: true, [modifier]: true }), true)).toBe(false);
  });
});
