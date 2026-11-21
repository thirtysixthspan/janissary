import type React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { EditorState } from './model';
import type { EditorApi } from './useEditor';
import type { LineFindApi } from '../shared/line-find/useLineFind';
import type { EditorSuggestApi, QueryLine } from './useEditorSuggest';
import type { KeyLike } from './keys';
import { useEditorInteractions } from './useEditorInteractions';

vi.mock('./handleSuggestKeyDown', () => ({ handleSuggestKeyDown: vi.fn(() => false) }));

function makeState(text = ''): EditorState {
  return { lines: text.split('\n'), cursor: { line: 0, col: 0 }, anchor: null };
}

function makeApi(state: EditorState = makeState()): EditorApi {
  return {
    state,
    stateRef: { current: state },
    load: vi.fn(),
    setState: vi.fn(),
    insert: vi.fn(),
    paste: vi.fn(),
    apply: vi.fn(),
    replace: vi.fn(),
    sealUndo: vi.fn(),
  };
}

function makeFind(overrides: Partial<LineFindApi> = {}): LineFindApi {
  return {
    findOpen: false,
    query: '',
    results: [],
    selected: 0,
    open: vi.fn(),
    close: vi.fn(),
    setQuery: vi.fn(),
    setSelected: vi.fn(),
    ...overrides,
  };
}

function makeQueryLine(text: string): QueryLine {
  return { anchorLine: 0, state: { lines: [text], cursor: { line: 0, col: text.length }, anchor: null } };
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
    focusTarget: 'buffer',
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

type Mods = Partial<Record<'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey', boolean>>;

function keyEvent(key: string, mods: Mods = {}, composing = false): React.KeyboardEvent {
  return {
    key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
    nativeEvent: { isComposing: composing },
    preventDefault: vi.fn(), stopPropagation: vi.fn(),
    ...mods,
  } as unknown as React.KeyboardEvent;
}

function pasteEvent(text: string): React.ClipboardEvent {
  return {
    clipboardData: { getData: vi.fn(() => text) },
    preventDefault: vi.fn(),
  } as unknown as React.ClipboardEvent;
}

type Setup = {
  api?: EditorApi;
  find?: LineFindApi;
  suggest?: EditorSuggestApi;
  pluginKey?: (event: KeyLike) => boolean;
  overlayOpen?: boolean;
  textareaValue?: string;
};

function renderInteractions(setup: Setup = {}) {
  const api = setup.api ?? makeApi();
  const find = setup.find ?? makeFind();
  const suggest = setup.suggest ?? makeSuggest();
  const pluginKey = setup.pluginKey ?? vi.fn(() => false);
  const textareaRef = { current: { value: setup.textareaValue ?? '' } as HTMLTextAreaElement };
  const { result } = renderHook(() => useEditorInteractions({
    bodyRef: { current: null },
    caretRef: { current: null },
    textareaRef,
    api,
    find,
    suggest,
    pluginKey,
    reveal: vi.fn(),
    overlayOpen: setup.overlayOpen ?? false,
  }));
  return { interactions: result.current, api, find, suggest, pluginKey, textareaRef };
}

describe('useEditorInteractions key precedence', () => {
  it('closes the find overlay on plain Escape before offering the chord to a plugin', () => {
    const find = makeFind({ findOpen: true });
    const pluginKey = vi.fn(() => true);
    const { interactions, api } = renderInteractions({ find, pluginKey });
    const event = keyEvent('Escape');

    interactions.onKeyDown(event);

    expect(find.close).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(pluginKey).not.toHaveBeenCalled();
    expect(api.apply).not.toHaveBeenCalled();
  });

  it('does not close the find overlay on a modified Escape', () => {
    const find = makeFind({ findOpen: true });
    const { interactions } = renderInteractions({ find });
    const event = keyEvent('Escape', { metaKey: true });

    interactions.onKeyDown(event);

    expect(find.close).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it('offers Shift+Tab to a plugin that claims it', () => {
    const pluginKey = vi.fn(() => true);
    const { interactions, api } = renderInteractions({ pluginKey });
    const event = keyEvent('Tab', { shiftKey: true });

    interactions.onKeyDown(event);

    expect(pluginKey).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(api.apply).not.toHaveBeenCalled();
  });

  it('offers Tab to a plugin when the selection spans lines', () => {
    const state = makeState('one\ntwo');
    state.anchor = { line: 0, col: 0 };
    state.cursor = { line: 1, col: 3 };
    const pluginKey = vi.fn(() => true);
    const { interactions, api } = renderInteractions({ api: makeApi(state), pluginKey });

    interactions.onKeyDown(keyEvent('Tab'));

    expect(pluginKey).toHaveBeenCalledOnce();
    expect(api.apply).not.toHaveBeenCalled();
  });

  it('offers Escape to a plugin when multiple selections exist', () => {
    const state = makeState('one\ntwo');
    state.extraSelections = [{ anchor: null, cursor: { line: 1, col: 0 } }];
    const pluginKey = vi.fn(() => true);
    const { interactions, api } = renderInteractions({ api: makeApi(state), pluginKey });

    interactions.onKeyDown(keyEvent('Escape'));

    expect(pluginKey).toHaveBeenCalledOnce();
    expect(api.apply).not.toHaveBeenCalled();
  });

  it('keeps plain Tab with the editor when no plugin yields', () => {
    const pluginKey = vi.fn(() => false);
    const { interactions, api } = renderInteractions({ pluginKey });
    const event = keyEvent('Tab');

    interactions.onKeyDown(event);

    expect(pluginKey).not.toHaveBeenCalled();
    expect(api.apply).toHaveBeenCalledWith({ kind: 'insert', text: '\t' }, 20, expect.any(Function));
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it('returns early for an editor binding while an overlay is open', () => {
    const find = makeFind({ findOpen: true });
    const pluginKey = vi.fn(() => true);
    const { interactions, api } = renderInteractions({ find, pluginKey, overlayOpen: true });
    const event = keyEvent('Escape');

    interactions.onKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(find.close).not.toHaveBeenCalled();
    expect(pluginKey).not.toHaveBeenCalled();
    expect(api.apply).not.toHaveBeenCalled();
  });

  it('ignores a keydown while the native event is composing', () => {
    const { interactions } = renderInteractions();
    const event = keyEvent('Enter', {}, true);

    interactions.onKeyDown(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});

describe('useEditorInteractions paste and composition', () => {
  it('routes a paste to the suggestion query when the query has focus', () => {
    const api = makeApi(makeState('buffer'));
    const suggest = makeSuggest({ queryLine: makeQueryLine('>'), focusTarget: 'query' });
    const { interactions } = renderInteractions({ api, suggest });
    const event = pasteEvent('hello');

    interactions.onPaste(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(suggest.setQueryLineState).toHaveBeenCalledWith(expect.objectContaining({ lines: ['>hello'] }));
    expect(api.paste).not.toHaveBeenCalled();
  });

  it('routes a paste to the buffer when no query has focus', () => {
    const api = makeApi();
    const { interactions } = renderInteractions({ api });

    interactions.onPaste(pasteEvent('hello'));

    expect(api.paste).toHaveBeenCalledWith('hello');
  });

  it('does not paste while an overlay is open', () => {
    const api = makeApi();
    const { interactions } = renderInteractions({ api, overlayOpen: true });
    const event = pasteEvent('hello');

    interactions.onPaste(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(api.paste).not.toHaveBeenCalled();
  });

  it('does not flush the textarea while composing', () => {
    const api = makeApi();
    const { interactions, textareaRef } = renderInteractions({ api, textareaValue: 'typed' });

    interactions.startComposition();
    interactions.flushTextarea();

    expect(api.insert).not.toHaveBeenCalled();
    expect(textareaRef.current.value).toBe('typed');
  });

  it('flushes the textarea into the buffer on endComposition and clears it', () => {
    const api = makeApi();
    const { interactions, textareaRef } = renderInteractions({ api, textareaValue: 'typed' });

    interactions.startComposition();
    interactions.endComposition();

    expect(api.insert).toHaveBeenCalledWith('typed');
    expect(textareaRef.current.value).toBe('');
  });

  it('flushes the textarea into the query line when the query has focus', () => {
    const api = makeApi();
    const suggest = makeSuggest({ queryLine: makeQueryLine('>'), focusTarget: 'query' });
    const { interactions } = renderInteractions({ api, suggest, textareaValue: 'typed' });

    interactions.flushTextarea();

    expect(suggest.setQueryLineState).toHaveBeenCalledWith(expect.objectContaining({ lines: ['>typed'] }));
    expect(api.insert).not.toHaveBeenCalled();
  });

  it('moves the cursor to a chosen find result and seals undo', () => {
    const api = makeApi(makeState('one\ntwo\nthree'));
    const find = makeFind({ results: [{ path: '', index: 2, score: 1, ranges: [] }] });
    const { interactions } = renderInteractions({ api, find });

    interactions.selectFindResult(0);

    expect(find.setSelected).toHaveBeenCalledWith(0);
    expect(api.sealUndo).toHaveBeenCalledOnce();
    expect(api.setState).toHaveBeenCalledWith(expect.objectContaining({ cursor: { line: 2, col: 0 }, anchor: null }));
  });
});
