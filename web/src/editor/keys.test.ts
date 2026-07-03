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

  it('leaves paste and printable characters to the hidden textarea', () => {
    // Cmd+V must NOT be intercepted: the paste flows through the textarea's input event.
    expect(actionForKey(key('v', { metaKey: true }))).toBeNull();
    expect(actionForKey(key('a'))).toBeNull();
    expect(actionForKey(key('x', { altKey: true }))).toBeNull();
  });
});
