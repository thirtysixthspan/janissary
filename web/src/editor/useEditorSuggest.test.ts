import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { EditorState } from './model';
import type { JanusClient } from '../ws';
import { useEditorSuggest } from './useEditorSuggest';

function makeState(text: string, cursorLine = 0): EditorState {
  return { lines: text.split('\n'), cursor: { line: cursorLine, col: 0 }, anchor: null };
}

// `Promise.withResolvers` (ES2024) predates this project's `lib` target; a small typed shim keeps
// the tests off the disallowed "extract resolver from `new Promise()`" pattern regardless.
function withResolvers<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  const state = { resolve: undefined as unknown as (value: T) => void };
  const promise = new Promise<T>((resolve) => { state.resolve = resolve; });
  return { promise, resolve: state.resolve };
}

function makeClient(personas: string[] = ['summarizer'], hunksQueue: { hunks: { anchor: string; replacement: string }[] }[] = []) {
  const request = vi.fn();
  request.mockResolvedValueOnce({ names: personas });
  for (const reply of hunksQueue) request.mockResolvedValueOnce(reply);
  return { client: { request } as unknown as JanusClient, request };
}

// Types the query text (after the leading `>` seeded by openQueryLine) via setQueryLineState.
function typeQuery(result: { current: ReturnType<typeof useEditorSuggest> }, text: string) {
  act(() => { result.current.openQueryLine(0); });
  act(() => {
    result.current.setQueryLineState({ lines: [`>${text}`], cursor: { line: 0, col: text.length + 1 }, anchor: null });
  });
}

describe('useEditorSuggest', () => {
  it('fetches the persona list on mount', async () => {
    const { client } = makeClient(['summarizer', 'reviewer']);
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', vi.fn()));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer', 'reviewer']));
  });

  it('opens the query line seeded with a leading > and closes it', async () => {
    const { client } = makeClient();
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', vi.fn()));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));

    act(() => { result.current.openQueryLine(2); });
    expect(result.current.queryLine).toEqual({ anchorLine: 2, state: { lines: ['>'], cursor: { line: 0, col: 1 }, anchor: null } });
    expect(result.current.focusTarget).toBe('query');

    act(() => { result.current.closeQueryLine(); });
    expect(result.current.queryLine).toBeNull();
    expect(result.current.focusTarget).toBe('buffer');
  });

  it('fires an editorSuggest request from the query text and opens the pending set', async () => {
    const { client, request } = makeClient(['summarizer'], [{ hunks: [{ anchor: 'old', replacement: 'new' }] }]);
    const setState = vi.fn();
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', setState));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));
    typeQuery(result, ' summarizer rewrite this');

    const bufferState = makeState('old');
    act(() => { result.current.fireOnLine(bufferState); });
    expect(result.current.firingLine).toBe('> summarizer rewrite this');

    expect(request).toHaveBeenCalledWith({
      method: 'editorSuggest',
      params: { url: '/open/1', persona: 'summarizer', content: 'old', prompt: 'rewrite this' },
    });
    await waitFor(() => expect(result.current.pending).not.toBeNull());
    expect(result.current.pending?.hunks).toEqual([{ anchor: 'old', replacement: 'new' }]);
    expect(result.current.firingLine).toBeNull();
  });

  it('discards the reply and does not reopen the pending set when closed while a request is in flight', async () => {
    const { client, request } = makeClient(['summarizer']);
    const { promise, resolve } = withResolvers<{ hunks: { anchor: string; replacement: string }[] }>();
    request.mockImplementationOnce(() => promise);
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', vi.fn()));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));
    typeQuery(result, ' summarizer rewrite this');

    act(() => { result.current.fireOnLine(makeState('old')); });
    expect(result.current.firingLine).toBe('> summarizer rewrite this');

    act(() => { result.current.closeQueryLine(); });
    expect(result.current.queryLine).toBeNull();

    await act(async () => { resolve({ hunks: [{ anchor: 'old', replacement: 'new' }] }); });

    expect(result.current.pending).toBeNull();
    expect(result.current.noSuggestionLine).toBeNull();
    expect(result.current.firingLine).toBeNull();
    expect(result.current.queryLine).toBeNull();
  });

  it('records the query as having no suggestion when the reply has no hunks', async () => {
    const { client } = makeClient(['summarizer'], [{ hunks: [] }]);
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', vi.fn()));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));
    typeQuery(result, ' summarizer rewrite this');

    await act(async () => { result.current.fireOnLine(makeState('old')); });

    await waitFor(() => expect(result.current.noSuggestionLine).toBe('> summarizer rewrite this'));
    expect(result.current.pending).toBeNull();
    expect(result.current.firingLine).toBeNull();
    expect(result.current.queryLine).not.toBeNull();
  });

  it('does not fire for a query that is not a valid request', async () => {
    const { client, request } = makeClient(['summarizer']);
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', vi.fn()));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));
    typeQuery(result, ' just some text');

    result.current.fireOnLine(makeState('old'));

    expect(request).toHaveBeenCalledTimes(1); // only the initial persona-list fetch
  });

  it('does not fire when no query line is open', async () => {
    const { client, request } = makeClient(['summarizer']);
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', vi.fn()));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));

    result.current.fireOnLine(makeState('old'));

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('ignores a second request while one is already pending', async () => {
    const { client, request } = makeClient(['summarizer'], [{ hunks: [{ anchor: 'a', replacement: 'b' }] }]);
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', vi.fn()));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));
    typeQuery(result, ' summarizer do it');

    const bufferState = makeState('a');
    await act(async () => { result.current.fireOnLine(bufferState); });
    await waitFor(() => expect(result.current.pending).not.toBeNull());

    result.current.fireOnLine(bufferState);
    expect(request).toHaveBeenCalledTimes(2); // persona list + the one query, never a second query
  });

  it('accepts a hunk, applies it, and closes the query line once all hunks resolve', async () => {
    const { client } = makeClient(['summarizer'], [{ hunks: [{ anchor: 'old text', replacement: 'new text' }] }]);
    let latest: EditorState | undefined;
    const setState = vi.fn((s: EditorState) => { latest = s; });
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', setState));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));
    typeQuery(result, ' summarizer rewrite');

    const bufferState = makeState('old text');
    await act(async () => { result.current.fireOnLine(bufferState); });
    await waitFor(() => expect(result.current.pending).not.toBeNull());

    act(() => { result.current.acceptHunk(bufferState, 0); });

    expect(latest?.lines).toEqual(['new text']);
    expect(result.current.pending).toBeNull();
    expect(result.current.queryLine).toBeNull();
  });

  it('declines every hunk, leaves the buffer unchanged, and keeps the query line open with its text', async () => {
    const { client } = makeClient(['summarizer'], [{ hunks: [{ anchor: 'old text', replacement: 'new text' }] }]);
    let latest: EditorState | undefined;
    const setState = vi.fn((s: EditorState) => { latest = s; });
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', setState));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));
    typeQuery(result, ' summarizer rewrite');

    const bufferState = makeState('old text');
    await act(async () => { result.current.fireOnLine(bufferState); });
    await waitFor(() => expect(result.current.pending).not.toBeNull());

    act(() => { result.current.declineHunk(bufferState, 0); });

    expect(latest?.lines).toEqual(['old text']);
    expect(result.current.pending).toBeNull();
    expect(result.current.queryLine?.state.lines).toEqual(['> summarizer rewrite']);
  });

  it('marks a hunk resolved without finalizing the set when more remain', async () => {
    const { client } = makeClient(['summarizer'], [{
      hunks: [{ anchor: 'a', replacement: '1' }, { anchor: 'b', replacement: '2' }],
    }]);
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', vi.fn()));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));
    typeQuery(result, ' summarizer rewrite');

    const bufferState = makeState('a\nb');
    await act(async () => { result.current.fireOnLine(bufferState); });
    await waitFor(() => expect(result.current.pending?.hunks.length).toBe(2));

    act(() => { result.current.declineHunk(bufferState, 1); });

    expect(result.current.pending?.resolved).toEqual([false, true]);
  });

  it('resolves hunks out of order and only finalizes once every slot is resolved', async () => {
    const { client } = makeClient(['summarizer'], [{
      hunks: [{ anchor: 'a', replacement: '1' }, { anchor: 'b', replacement: '2' }],
    }]);
    let latest: EditorState | undefined;
    const setState = vi.fn((s: EditorState) => { latest = s; });
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', setState));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));
    typeQuery(result, ' summarizer rewrite');

    const bufferState = makeState('a\nb');
    await act(async () => { result.current.fireOnLine(bufferState); });
    await waitFor(() => expect(result.current.pending?.hunks.length).toBe(2));

    act(() => { result.current.acceptHunk(bufferState, 1); });
    expect(result.current.pending?.resolved).toEqual([false, true]);
    expect(result.current.pending).not.toBeNull();

    act(() => { result.current.acceptHunk(latest ?? bufferState, 0); });
    expect(result.current.pending).toBeNull();
    expect(latest?.lines).toEqual(['1', '2']);
  });

  it('exits the query into the buffer at the anchor line ± direction, at the given column', async () => {
    const { client } = makeClient();
    const setState = vi.fn();
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', setState));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));

    act(() => { result.current.openQueryLine(2); });
    const bufferState: EditorState = { lines: ['one', '', 'two'], cursor: { line: 2, col: 0 }, anchor: null };

    act(() => { result.current.exitQueryToBuffer(-1, 1, bufferState); });

    expect(result.current.focusTarget).toBe('buffer');
    expect(setState).toHaveBeenCalledWith({ ...bufferState, cursor: { line: 1, col: 0 }, anchor: null, goalCol: undefined });
  });

  it('does not exit the query when there is no buffer line in that direction', async () => {
    const { client } = makeClient();
    const setState = vi.fn();
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', setState));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));

    act(() => { result.current.openQueryLine(0); });
    const bufferState: EditorState = { lines: [''], cursor: { line: 0, col: 0 }, anchor: null };

    act(() => { result.current.exitQueryToBuffer(-1, 0, bufferState); });

    expect(setState).not.toHaveBeenCalled();
    expect(result.current.focusTarget).toBe('query');
  });

  it('enters the query from the buffer at its first line when moving down, last line when moving up', async () => {
    const { client } = makeClient();
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', vi.fn()));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));

    act(() => { result.current.openQueryLine(1); });
    act(() => {
      result.current.setQueryLineState({ lines: ['> summarizer', 'more text'], cursor: { line: 0, col: 0 }, anchor: null });
    });

    act(() => { result.current.enterQueryFromBuffer(1, 3); });
    expect(result.current.focusTarget).toBe('query');
    expect(result.current.queryLine?.state.cursor).toEqual({ line: 0, col: 3 });

    act(() => { result.current.enterQueryFromBuffer(-1, 3); });
    expect(result.current.queryLine?.state.cursor).toEqual({ line: 1, col: 3 });
  });

  it('is a no-op resolving an already-resolved hunk', async () => {
    const { client } = makeClient(['summarizer'], [{
      hunks: [{ anchor: 'a', replacement: '1' }, { anchor: 'b', replacement: '2' }],
    }]);
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', vi.fn()));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));
    typeQuery(result, ' summarizer rewrite');

    const bufferState = makeState('a\nb');
    await act(async () => { result.current.fireOnLine(bufferState); });
    await waitFor(() => expect(result.current.pending?.hunks.length).toBe(2));

    act(() => { result.current.declineHunk(bufferState, 0); });
    act(() => { result.current.declineHunk(bufferState, 0); });

    expect(result.current.pending?.resolved).toEqual([true, false]);
  });
});
