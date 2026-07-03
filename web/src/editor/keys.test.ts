import { describe, it, expect } from 'vitest';
import { actionForKey, type KeyLike } from './keys';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike =>
  ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe('actionForKey', () => {
  it('maps plain navigation and editing keys', () => {
    expect(actionForKey(key('ArrowLeft'))).toEqual({ kind: 'move', dir: 'left', extend: false });
    expect(actionForKey(key('ArrowDown', { shiftKey: true }))).toEqual({ kind: 'move', dir: 'down', extend: true });
    expect(actionForKey(key('PageDown'))).toEqual({ kind: 'page', dir: 1, extend: false });
    expect(actionForKey(key('Home'))).toEqual({ kind: 'lineEdge', edge: 'home', extend: false });
    expect(actionForKey(key('Enter'))).toEqual({ kind: 'insert', text: '\n' });
    expect(actionForKey(key('Tab'))).toEqual({ kind: 'insert', text: '\t' });
    expect(actionForKey(key('Backspace'))).toEqual({ kind: 'deleteBackward' });
    expect(actionForKey(key('Delete'))).toEqual({ kind: 'deleteForward' });
    expect(actionForKey(key('Escape'))).toEqual({ kind: 'escape' });
  });

  it('maps the Emacs-style Ctrl subset', () => {
    expect(actionForKey(key('a', { ctrlKey: true }))).toEqual({ kind: 'lineEdge', edge: 'home', extend: false });
    expect(actionForKey(key('e', { ctrlKey: true }))).toEqual({ kind: 'lineEdge', edge: 'end', extend: false });
    expect(actionForKey(key('f', { ctrlKey: true }))).toEqual({ kind: 'move', dir: 'right', extend: false });
    expect(actionForKey(key('b', { ctrlKey: true }))).toEqual({ kind: 'move', dir: 'left', extend: false });
    expect(actionForKey(key('n', { ctrlKey: true }))).toEqual({ kind: 'move', dir: 'down', extend: false });
    expect(actionForKey(key('p', { ctrlKey: true }))).toEqual({ kind: 'move', dir: 'up', extend: false });
    expect(actionForKey(key('d', { ctrlKey: true }))).toEqual({ kind: 'deleteForward' });
    expect(actionForKey(key('k', { ctrlKey: true }))).toEqual({ kind: 'kill' });
    expect(actionForKey(key('y', { ctrlKey: true }))).toEqual({ kind: 'yank' });
    expect(actionForKey(key('Home', { ctrlKey: true }))).toEqual({ kind: 'docEdge', edge: 'start', extend: false });
  });

  it('maps the Cmd app chords', () => {
    expect(actionForKey(key('s', { metaKey: true }))).toEqual({ kind: 'save' });
    expect(actionForKey(key('s', { ctrlKey: true }))).toEqual({ kind: 'save' });
    expect(actionForKey(key('z', { metaKey: true }))).toEqual({ kind: 'undo' });
    expect(actionForKey(key('z', { metaKey: true, shiftKey: true }))).toEqual({ kind: 'redo' });
    expect(actionForKey(key('a', { metaKey: true }))).toEqual({ kind: 'selectAll' });
    expect(actionForKey(key('c', { metaKey: true }))).toEqual({ kind: 'copy' });
    expect(actionForKey(key('x', { metaKey: true }))).toEqual({ kind: 'cut' });
    expect(actionForKey(key('ArrowLeft', { metaKey: true }))).toEqual({ kind: 'lineEdge', edge: 'home', extend: false });
    expect(actionForKey(key('ArrowUp', { metaKey: true }))).toEqual({ kind: 'docEdge', edge: 'start', extend: false });
  });

  it('maps printable characters to insert actions and leaves paste to the textarea', () => {
    expect(actionForKey(key('a'))).toEqual({ kind: 'insert', text: 'a' });
    expect(actionForKey(key('1'))).toEqual({ kind: 'insert', text: '1' });
    expect(actionForKey(key(' '))).toEqual({ kind: 'insert', text: ' ' });
    expect(actionForKey(key('A', { shiftKey: true }))).toEqual({ kind: 'insert', text: 'A' });
    // Cmd+V must NOT be intercepted: the paste flows through the textarea's input event.
    expect(actionForKey(key('v', { metaKey: true }))).toBeNull();
    // Alt+letter is suppressed — the altKey guard in actionForKey returns null before plainAction.
    expect(actionForKey(key('x', { altKey: true }))).toBeNull();
  });
});
