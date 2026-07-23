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
    expect(suggest.setQueryLineState).toHaveBeenCalledWith({ lines: ['>a'], cursor: { line: 0, col: 2 }, anchor: null });
  });

  it('routes Backspace into the query text', () => {
    const api = makeApi(makeState(''));
    const suggest = makeSuggest({ queryLine: makeQueryLine('>ab') });
    const e = makeEvent('Backspace');

    handleSuggestKeyDown(e, api, suggest);

    expect(suggest.setQueryLineState).toHaveBeenCalledWith({ lines: ['>a'], cursor: { line: 0, col: 2 }, anchor: null });
  });

  it('routes Left/Right arrows within the query text', () => {
    const api = makeApi(makeState(''));
    const suggest = makeSuggest({ queryLine: makeQueryLine('>ab', 1) });
    const e = makeEvent('ArrowRight');

    handleSuggestKeyDown(e, api, suggest);

    expect(suggest.setQueryLineState).toHaveBeenCalledWith({ lines: ['>ab'], cursor: { line: 0, col: 2 }, anchor: null });
  });

  it('treats Up/Down as no-ops that are still consumed', () => {
    const api = makeApi(makeState(''));
    const suggest = makeSuggest({ queryLine: makeQueryLine('>ab', 1) });

    const up = handleSuggestKeyDown(makeEvent('ArrowUp'), api, suggest);
    const down = handleSuggestKeyDown(makeEvent('ArrowDown'), api, suggest);

    expect(up).toBe(true);
    expect(down).toBe(true);
    expect(suggest.setQueryLineState).not.toHaveBeenCalled();
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
});
