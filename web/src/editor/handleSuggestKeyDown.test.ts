import type React from 'react';
import { describe, it, expect, vi } from 'vitest';
import type { EditorState } from './model';
import type { EditorApi } from './useEditor';
import type { EditorSuggestApi } from './useEditorSuggest';
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

function makeSuggest(overrides: Partial<EditorSuggestApi> = {}): EditorSuggestApi {
  return {
    personas: ['summarizer'],
    pending: null,
    firingLine: null,
    noSuggestionLine: null,
    focusedPillLine: null,
    setFocusedPillLine: vi.fn(),
    fireOnLine: vi.fn(),
    acceptHunk: vi.fn(),
    declineHunk: vi.fn(),
    ...overrides,
  };
}

function makeEvent(key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean }> = {}): React.KeyboardEvent {
  return { key, metaKey: false, ctrlKey: false, ...mods, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
}

describe('handleSuggestKeyDown pending hunks', () => {
  it('blocks any key while a hunk is pending, without resolving anything itself', () => {
    const state = makeState('old text\n> summarizer rewrite');
    const api = makeApi(state);
    const suggest = makeSuggest({
      pending: { hunks: [{ anchor: 'old text', replacement: 'new text' }], resolved: [false], requestLineText: '> summarizer rewrite', acceptedAny: false },
    });
    const e = makeEvent('a');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(suggest.acceptHunk).not.toHaveBeenCalled();
    expect(suggest.declineHunk).not.toHaveBeenCalled();
  });
});

describe('handleSuggestKeyDown pill focus', () => {
  it('focuses the pill on Tab when the request line is runnable', () => {
    const state = makeState('> summarizer rewrite this', 0, 26);
    const api = makeApi(state);
    const suggest = makeSuggest();
    const e = makeEvent('Tab');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(suggest.setFocusedPillLine).toHaveBeenCalledWith(0);
  });

  it('still completes a persona name on Tab in priority over focusing the pill', () => {
    const state = makeState('> summ', 0, 6);
    const api = makeApi(state);
    const suggest = makeSuggest();
    const e = makeEvent('Tab');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(true);
    expect(api.setState).toHaveBeenCalled();
    expect(suggest.setFocusedPillLine).not.toHaveBeenCalled();
  });

  it('fires the request and clears focus on a plain Enter while the pill is focused', () => {
    const state = makeState('> summarizer rewrite this', 0, 26);
    const api = makeApi(state);
    const suggest = makeSuggest({ focusedPillLine: 0 });
    const e = makeEvent('Enter');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(suggest.setFocusedPillLine).toHaveBeenCalledWith(null);
    expect(suggest.fireOnLine).toHaveBeenCalledWith(state, 0);
  });

  it('clears focus without firing on any other key while the pill is focused', () => {
    const state = makeState('> summarizer rewrite this', 0, 26);
    const api = makeApi(state);
    const suggest = makeSuggest({ focusedPillLine: 0 });
    const e = makeEvent('ArrowLeft');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(false);
    expect(suggest.setFocusedPillLine).toHaveBeenCalledWith(null);
    expect(suggest.fireOnLine).not.toHaveBeenCalled();
  });

  it('does not focus the pill on Tab for a non-runnable request line', () => {
    const state = makeState('> summarizer ', 0, 13);
    const api = makeApi(state);
    const suggest = makeSuggest();
    const e = makeEvent('Tab');

    const handled = handleSuggestKeyDown(e, api, suggest);

    expect(handled).toBe(false);
    expect(suggest.setFocusedPillLine).not.toHaveBeenCalled();
  });
});
