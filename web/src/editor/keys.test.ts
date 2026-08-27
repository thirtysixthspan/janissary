import { describe, it, expect } from 'vitest';
import { actionForKey, yieldsToPlugins, type KeyLike } from './keys';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike =>
  ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe('actionForKey', () => {
  it('maps plain navigation and editing keys', () => {
    expect(actionForKey(key('ArrowLeft'))).toEqual({ kind: 'move', dir: 'left', extend: false });
    expect(actionForKey(key('ArrowDown', { shiftKey: true }))).toEqual({ kind: 'move', dir: 'down', extend: true });
    expect(actionForKey(key('PageDown'))).toEqual({ kind: 'page', dir: 1, extend: false });
    expect(actionForKey(key('PageUp'))).toEqual({ kind: 'page', dir: -1, extend: false });
    expect(actionForKey(key('Home'))).toEqual({ kind: 'lineEdge', edge: 'home', extend: false });
    expect(actionForKey(key('End'))).toEqual({ kind: 'lineEdge', edge: 'end', extend: false });
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
    expect(actionForKey(key('End', { ctrlKey: true }))).toEqual({ kind: 'docEdge', edge: 'end', extend: false });
    expect(actionForKey(key('z', { ctrlKey: true }))).toEqual({ kind: 'undo' });
    expect(actionForKey(key('z', { ctrlKey: true, shiftKey: true }))).toEqual({ kind: 'redo' });
  });

  it('maps the Cmd app chords', () => {
    expect(actionForKey(key('s', { metaKey: true }))).toEqual({ kind: 'save' });
    expect(actionForKey(key('s', { ctrlKey: true }))).toEqual({ kind: 'save' });
    expect(actionForKey(key('z', { metaKey: true }))).toEqual({ kind: 'undo' });
    expect(actionForKey(key('z', { metaKey: true, shiftKey: true }))).toEqual({ kind: 'redo' });
    expect(actionForKey(key('a', { metaKey: true }))).toEqual({ kind: 'selectAll' });
    expect(actionForKey(key('c', { metaKey: true }))).toEqual({ kind: 'copy' });
    expect(actionForKey(key('x', { metaKey: true }))).toEqual({ kind: 'cut' });
    expect(actionForKey(key('f', { metaKey: true }))).toEqual({ kind: 'find' });
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
    // Cmd+F opens the find overlay without shadowing the Emacs-style Ctrl+F, and Alt+F is nothing.
    expect(actionForKey(key('f', { ctrlKey: true }))).toEqual({ kind: 'move', dir: 'right', extend: false });
    expect(actionForKey(key('f', { altKey: true }))).toBeNull();
  });
});

describe('yieldsToPlugins', () => {
  // The two conditions a yield can depend on, as the four contexts they make.
  const context = (selectionSpansLines: boolean, multipleSelections = false) => (
    { selectionSpansLines, multipleSelections }
  );

  it('yields Tab only while the selection spans more than one line', () => {
    expect(yieldsToPlugins(key('Tab'), context(true))).toBe(true);
    expect(yieldsToPlugins(key('Tab'), context(false))).toBe(false);
  });

  it('yields Shift+Tab in every context', () => {
    expect(yieldsToPlugins(key('Tab', { shiftKey: true }), context(true))).toBe(true);
    expect(yieldsToPlugins(key('Tab', { shiftKey: true }), context(false))).toBe(true);
  });

  it('yields Escape only while there are several selections', () => {
    expect(yieldsToPlugins(key('Escape'), context(false, true))).toBe(true);
    expect(yieldsToPlugins(key('Escape'), context(true, true))).toBe(true);
    expect(yieldsToPlugins(key('Escape'), context(false))).toBe(false);
    // Shift+Escape is a different chord, and no plugin is offered it.
    expect(yieldsToPlugins(key('Escape', { shiftKey: true }), context(false, true))).toBe(false);
  });

  it('yields nothing else, whatever the selection is', () => {
    for (const spans of [true, false]) {
      expect(yieldsToPlugins(key('s', { metaKey: true }), context(spans, true))).toBe(false);
      expect(yieldsToPlugins(key('z', { metaKey: true }), context(spans, true))).toBe(false);
      expect(yieldsToPlugins(key('Enter'), context(spans, true))).toBe(false);
      expect(yieldsToPlugins(key('a'), context(spans, true))).toBe(false);
    }
  });

  it('does not yield a modified Tab, which is a different chord entirely', () => {
    expect(yieldsToPlugins(key('Tab', { metaKey: true }), context(true))).toBe(false);
    expect(yieldsToPlugins(key('Tab', { ctrlKey: true }), context(true))).toBe(false);
    expect(yieldsToPlugins(key('Tab', { altKey: true }), context(true))).toBe(false);
  });

  it('leaves the core table answering for Tab, so an unclaimed yield still inserts', () => {
    expect(actionForKey(key('Tab'))).toEqual({ kind: 'insert', text: '\t' });
    expect(actionForKey(key('Tab', { shiftKey: true }))).toEqual({ kind: 'insert', text: '\t' });
  });
});
