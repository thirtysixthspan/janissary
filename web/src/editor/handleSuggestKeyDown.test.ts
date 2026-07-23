import type React from 'react';
import { describe, it, expect, vi } from 'vitest';
import type { EditorState } from './model';
import type { EditorApi } from './useEditor';
import type { EditorSuggestApi, QueryLine } from './useEditorSuggest';
import { handleSuggestKeyDown } from './handleSuggestKeyDown';

function makeState(text: string, cursorLine = 0, cursorCol = 0): EditorState {
  return { lines: text.split('\n'), cursor: { line: cursorLine, col: cursorCol }, anchor: null };
}

function makeApi(state: EditorState): EditorApi {
  return {
    state,
    stateRef: { current: state },
    load: vi.fn(),
    setState: vi.fn(),
    insert: vi.fn(),
    apply: vi.fn(),
    sealUndo: vi.fn(),
  };
}

function makeQueryLine(text: string, col = text.length, anchorLine = 0): QueryLine {
  return { anchorLine, state: { lines: [text], cursor: { line: 0, col }, anchor: null } };
}

function makeSuggest(overrides: Partial<EditorSuggestApi> = {}): EditorSuggestApi {
  return {
    personas: ['summarizer'],
    pending: null,
    firingLine: null,
    noSuggestionLine: null,
    queryLine: null,
    pillFocused: false,
    setPillFocused: vi.fn(),
    focusTarget: 'query',
    setFocusTarget: vi.fn(),
    openQueryLine: vi.fn(),
    closeQueryLine: vi.fn(),
    setQueryLineState: vi.fn(),
    exitQueryToBuffer: vi.fn(),
    enterQueryFromBuffer: vi.fn(),
    applyQueryAction: vi.fn(),
    fireOnLine: vi.fn(),
    acceptHunk: vi.fn(),
    declineHunk: vi.fn(),
    ...overrides,
  };
}

function makeEvent(key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }> = {}): React.KeyboardEvent {
  return { key, metaKey: false, ctrlKey: false, shiftKey: false, ...mods, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
}

describe('handleSuggestKeyDown pending hunks', () => {
  it('blocks any key while a hunk is pending, without resolving anything itself', () => {
    const state = makeState('old text');
    const api = makeApi(state);
    const suggest = makeSuggest({
      pending: { hunks: [{ anchor: 'old text', replacement: 'new text' }], resolved: [false], acceptedAny: false },
    });
    const e = makeEvent('a');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(suggest.acceptHunk).not.toHaveBeenCalled();
    expect(suggest.declineHunk).not.toHaveBeenCalled();
  });
});

describe('handleSuggestKeyDown opening the query line', () => {
  it('opens the query line when > is typed as the first character of an empty line', () => {
    const state = makeState('', 0, 0);
    const api = makeApi(state);
    const suggest = makeSuggest();
    const e = makeEvent('>');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(suggest.openQueryLine).toHaveBeenCalledWith(0);
  });

  it('does not open the query line when > is typed mid-line', () => {
    const state = makeState('abc', 0, 1);
    const api = makeApi(state);
    const suggest = makeSuggest();
    const e = makeEvent('>');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(false);
    expect(suggest.openQueryLine).not.toHaveBeenCalled();
  });

  it('does not open the query line when the line is not empty', () => {
    const state = makeState('abc', 0, 0);
    const api = makeApi(state);
    const suggest = makeSuggest();
    const e = makeEvent('>');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(false);
    expect(suggest.openQueryLine).not.toHaveBeenCalled();
  });
});

describe('handleSuggestKeyDown while the query line is active', () => {
  it('routes printable keys into the query text, not the buffer', () => {
    const api = makeApi(makeState(''));
    const suggest = makeSuggest({ queryLine: makeQueryLine('>') });
    const e = makeEvent('a');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(true);
    expect(api.insert).not.toHaveBeenCalled();
    expect(suggest.applyQueryAction).toHaveBeenCalledWith({ kind: 'insert', text: 'a' }, 20);
  });

  it('routes Backspace into the query text', () => {
    const api = makeApi(makeState(''));
    const suggest = makeSuggest({ queryLine: makeQueryLine('>ab') });
    const e = makeEvent('Backspace');

    handleSuggestKeyDown(e, api, suggest);

    expect(suggest.applyQueryAction).toHaveBeenCalledWith({ kind: 'deleteBackward' }, 20);
  });

  it('routes Left/Right arrows within the query text', () => {
    const api = makeApi(makeState(''));
    const suggest = makeSuggest({ queryLine: makeQueryLine('>ab', 1) });
    const e = makeEvent('ArrowRight');

    handleSuggestKeyDown(e, api, suggest);

    expect(suggest.applyQueryAction).toHaveBeenCalledWith({ kind: 'move', dir: 'right', extend: false }, 20);
  });

  it('exits a single-line query into the buffer on ArrowUp/ArrowDown, since both are at its edge', () => {
    const bufferState = makeState('one\n\ntwo', 1, 0);
    const api = makeApi(bufferState);
    const suggest = makeSuggest({ queryLine: makeQueryLine('>ab', 1, 1) });

    const up = handleSuggestKeyDown(makeEvent('ArrowUp'), api, suggest);
    expect(up).toBe(true);
    expect(suggest.exitQueryToBuffer).toHaveBeenCalledWith(-1, 1, bufferState);
    expect(suggest.setQueryLineState).not.toHaveBeenCalled();

    const down = handleSuggestKeyDown(makeEvent('ArrowDown'), api, suggest);
    expect(down).toBe(true);
    expect(suggest.exitQueryToBuffer).toHaveBeenCalledWith(1, 1, bufferState);
  });

  it('matches the buffer keybindings for save, undo/redo, select-all, and copy/cut on the query line', () => {
    const api = makeApi(makeState(''));
    const suggest = makeSuggest({ queryLine: makeQueryLine('>ab', 1) });

    handleSuggestKeyDown(makeEvent('s', { metaKey: true }), api, suggest);
    expect(suggest.applyQueryAction).toHaveBeenCalledWith({ kind: 'save' }, 20);

    handleSuggestKeyDown(makeEvent('z', { metaKey: true }), api, suggest);
    expect(suggest.applyQueryAction).toHaveBeenCalledWith({ kind: 'undo' }, 20);

    handleSuggestKeyDown(makeEvent('z', { metaKey: true, shiftKey: true }), api, suggest);
    expect(suggest.applyQueryAction).toHaveBeenCalledWith({ kind: 'redo' }, 20);

    handleSuggestKeyDown(makeEvent('a', { metaKey: true }), api, suggest);
    expect(suggest.applyQueryAction).toHaveBeenCalledWith({ kind: 'selectAll' }, 20);

    handleSuggestKeyDown(makeEvent('c', { metaKey: true }), api, suggest);
    expect(suggest.applyQueryAction).toHaveBeenCalledWith({ kind: 'copy' }, 20);

    handleSuggestKeyDown(makeEvent('x', { metaKey: true }), api, suggest);
    expect(suggest.applyQueryAction).toHaveBeenCalledWith({ kind: 'cut' }, 20);
  });

  it('a Cmd/Ctrl+ArrowUp on the query line moves within it instead of crossing into the buffer', () => {
    const bufferState = makeState('one\n\ntwo', 1, 0);
    const api = makeApi(bufferState);
    const suggest = makeSuggest({ queryLine: makeQueryLine('>ab', 1, 1) });

    const handled = handleSuggestKeyDown(makeEvent('ArrowUp', { metaKey: true }), api, suggest);

    expect(handled).toBe(true);
    expect(suggest.exitQueryToBuffer).not.toHaveBeenCalled();
    expect(suggest.applyQueryAction).toHaveBeenCalledWith({ kind: 'docEdge', edge: 'start', extend: false }, 20);
  });

  it('moves within a multiline query instead of exiting when a neighboring query line exists', () => {
    const api = makeApi(makeState(''));
    const suggest = makeSuggest({
      queryLine: { anchorLine: 0, state: { lines: ['> summarizer rewrite', 'more text'], cursor: { line: 1, col: 3 }, anchor: null } },
    });

    const handled = handleSuggestKeyDown(makeEvent('ArrowUp'), api, suggest);

    expect(handled).toBe(true);
    expect(suggest.setQueryLineState).toHaveBeenCalledWith({ lines: ['> summarizer rewrite', 'more text'], cursor: { line: 0, col: 3 }, anchor: null, goalCol: 3 });
    expect(suggest.exitQueryToBuffer).not.toHaveBeenCalled();
  });

  it('inserts a line break into the query on Shift+Enter instead of firing', () => {
    const bufferState = makeState('buffer content');
    const api = makeApi(bufferState);
    const suggest = makeSuggest({ queryLine: makeQueryLine('> summarizer rewrite this') });
    const e = makeEvent('Enter', { shiftKey: true });

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(true);
    expect(suggest.setQueryLineState).toHaveBeenCalledWith({ lines: ['> summarizer rewrite this', ''], cursor: { line: 1, col: 0 }, anchor: null });
    expect(suggest.fireOnLine).not.toHaveBeenCalled();
  });

  it('closes the query line on Escape without inserting anything', () => {
    const api = makeApi(makeState(''));
    const suggest = makeSuggest({ queryLine: makeQueryLine('> summarizer x') });
    const e = makeEvent('Escape');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(suggest.closeQueryLine).toHaveBeenCalled();
    expect(suggest.setQueryLineState).not.toHaveBeenCalled();
  });

  it('fires on Enter when the query is runnable and never inserts a buffer newline', () => {
    const bufferState = makeState('buffer content');
    const api = makeApi(bufferState);
    const suggest = makeSuggest({ queryLine: makeQueryLine('> summarizer rewrite this') });
    const e = makeEvent('Enter');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(suggest.fireOnLine).toHaveBeenCalledWith(bufferState);
    expect(api.insert).not.toHaveBeenCalled();
  });

  it('fires on Ctrl/Cmd+Enter when runnable', () => {
    const bufferState = makeState('buffer content');
    const api = makeApi(bufferState);
    const suggest = makeSuggest({ queryLine: makeQueryLine('> summarizer rewrite this') });
    const e = makeEvent('Enter', { metaKey: true });

    handleSuggestKeyDown(e, api, suggest);

    expect(suggest.fireOnLine).toHaveBeenCalledWith(bufferState);
  });

  it('is a no-op on Enter when the query is not yet runnable', () => {
    const api = makeApi(makeState(''));
    const suggest = makeSuggest({ queryLine: makeQueryLine('> summarizer') });
    const e = makeEvent('Enter');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(true);
    expect(suggest.fireOnLine).not.toHaveBeenCalled();
  });

  it('completes a persona name on Tab', () => {
    const api = makeApi(makeState(''));
    const suggest = makeSuggest({ queryLine: makeQueryLine('> summ', 6) });
    const e = makeEvent('Tab');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(true);
    expect(suggest.setQueryLineState).toHaveBeenCalledWith({ lines: ['> summarizer '], cursor: { line: 0, col: 13 }, anchor: null });
    expect(suggest.setPillFocused).not.toHaveBeenCalled();
  });

  it('focuses the pill on Tab in priority over completion once the request is runnable', () => {
    const api = makeApi(makeState(''));
    const suggest = makeSuggest({ queryLine: makeQueryLine('> summarizer rewrite this', 26) });
    const e = makeEvent('Tab');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(true);
    expect(suggest.setPillFocused).toHaveBeenCalledWith(true);
    expect(suggest.setQueryLineState).not.toHaveBeenCalled();
  });

  it('fires and clears pill focus on a plain Enter while the pill is focused', () => {
    const bufferState = makeState('buffer content');
    const api = makeApi(bufferState);
    const suggest = makeSuggest({ queryLine: makeQueryLine('> summarizer rewrite this', 26), pillFocused: true });
    const e = makeEvent('Enter');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(true);
    expect(suggest.setPillFocused).toHaveBeenCalledWith(false);
    expect(suggest.fireOnLine).toHaveBeenCalledWith(bufferState);
  });

  it('clears pill focus without firing on any other key while the pill is focused', () => {
    const api = makeApi(makeState(''));
    const suggest = makeSuggest({ queryLine: makeQueryLine('> summarizer rewrite this', 26), pillFocused: true });
    const e = makeEvent('ArrowLeft');

    handleSuggestKeyDown(e, api, suggest);

    expect(suggest.setPillFocused).toHaveBeenCalledWith(false);
    expect(suggest.fireOnLine).not.toHaveBeenCalled();
  });
});

describe('handleSuggestKeyDown while the query line is open but the buffer holds focus', () => {
  it('does not route a printable key into the query text, leaving it for the buffer', () => {
    const api = makeApi(makeState('abc', 0, 1));
    const suggest = makeSuggest({ queryLine: makeQueryLine('> summarizer x'), focusTarget: 'buffer' });
    const e = makeEvent('a');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(false);
    expect(suggest.setQueryLineState).not.toHaveBeenCalled();
  });

  it('does not intercept Escape, leaving it for the buffer', () => {
    const api = makeApi(makeState('abc', 0, 1));
    const suggest = makeSuggest({ queryLine: makeQueryLine('> summarizer x'), focusTarget: 'buffer' });
    const e = makeEvent('Escape');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(false);
    expect(suggest.closeQueryLine).not.toHaveBeenCalled();
  });

  it('crosses into the query line when ArrowDown would land on its anchor line', () => {
    const api = makeApi(makeState('one\n\ntwo', 0, 2));
    const suggest = makeSuggest({ queryLine: makeQueryLine('>', 1, 1), focusTarget: 'buffer' });
    const e = makeEvent('ArrowDown');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(suggest.enterQueryFromBuffer).toHaveBeenCalledWith(1, 2);
  });

  it('crosses into the query line when ArrowUp would land on its anchor line', () => {
    const api = makeApi(makeState('one\n\ntwo', 2, 2));
    const suggest = makeSuggest({ queryLine: makeQueryLine('>', 1, 1), focusTarget: 'buffer' });
    const e = makeEvent('ArrowUp');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(true);
    expect(suggest.enterQueryFromBuffer).toHaveBeenCalledWith(-1, 2);
  });

  it('does not cross into the query for a non-adjacent ArrowDown, or with a modifier held', () => {
    const api = makeApi(makeState('one\n\ntwo\nthree', 0, 1));
    const suggest = makeSuggest({ queryLine: makeQueryLine('>', 1, 2), focusTarget: 'buffer' });

    expect(handleSuggestKeyDown(makeEvent('ArrowDown'), api, suggest)).toBe(false);
    expect(suggest.enterQueryFromBuffer).not.toHaveBeenCalled();

    const apiAdjacent = makeApi(makeState('one\n\ntwo', 0, 1));
    const shiftHeld = handleSuggestKeyDown(makeEvent('ArrowDown', { shiftKey: true }), apiAdjacent, makeSuggest({ queryLine: makeQueryLine('>', 1, 1), focusTarget: 'buffer' }));
    expect(shiftHeld).toBe(false);
  });
});
