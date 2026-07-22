import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { EditorState } from './model';
import type { JanusClient } from '../ws';
import { useEditorSuggest } from './useEditorSuggest';

function makeState(text: string, cursorLine = 0): EditorState {
  return { lines: text.split('\n'), cursor: { line: cursorLine, col: 0 }, anchor: null };
}

function makeClient(personas: string[] = ['summarizer'], hunksQueue: { hunks: { anchor: string; replacement: string }[] }[] = []) {
  const request = vi.fn();
  request.mockResolvedValueOnce({ names: personas });
  for (const reply of hunksQueue) request.mockResolvedValueOnce(reply);
  return { client: { request } as unknown as JanusClient, request };
}

describe('useEditorSuggest', () => {
  it('fetches the persona list on mount', async () => {
    const { client } = makeClient(['summarizer', 'reviewer']);
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', vi.fn()));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer', 'reviewer']));
  });

  it('fires an editorSuggest request for a valid request line and opens the pending set', async () => {
    const { client, request } = makeClient(['summarizer'], [{ hunks: [{ anchor: 'old', replacement: 'new' }] }]);
    const setState = vi.fn();
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', setState));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));

    const state = makeState('> summarizer rewrite this');
    act(() => { result.current.fireOnLine(state, 0); });
    expect(result.current.firingLine).toBe('> summarizer rewrite this');

    expect(request).toHaveBeenCalledWith({
      method: 'editorSuggest',
      params: { url: '/open/1', persona: 'summarizer', content: '> summarizer rewrite this', prompt: 'rewrite this' },
    });
    await waitFor(() => expect(result.current.pending).not.toBeNull());
    expect(result.current.pending?.hunks).toEqual([{ anchor: 'old', replacement: 'new' }]);
    expect(result.current.firingLine).toBeNull();
  });

  it('records the line as having no suggestion when the reply has no hunks', async () => {
    const { client } = makeClient(['summarizer'], [{ hunks: [] }]);
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', vi.fn()));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));

    const state = makeState('> summarizer rewrite this');
    await act(async () => { result.current.fireOnLine(state, 0); });

    await waitFor(() => expect(result.current.noSuggestionLine).toBe('> summarizer rewrite this'));
    expect(result.current.pending).toBeNull();
    expect(result.current.firingLine).toBeNull();
  });

  it('does not fire for a line that is not a valid request', async () => {
    const { client, request } = makeClient(['summarizer']);
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', vi.fn()));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));

    result.current.fireOnLine(makeState('just some text'), 0);

    expect(request).toHaveBeenCalledTimes(1); // only the initial persona-list fetch
  });

  it('ignores a second request while one is already pending', async () => {
    const { client, request } = makeClient(['summarizer'], [{ hunks: [{ anchor: 'a', replacement: 'b' }] }]);
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', vi.fn()));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));

    const state = makeState('> summarizer do it');
    await act(async () => { result.current.fireOnLine(state, 0); });
    await waitFor(() => expect(result.current.pending).not.toBeNull());

    result.current.fireOnLine(state, 0);
    expect(request).toHaveBeenCalledTimes(2); // persona list + the one query, never a second query
  });

  it('accepts a hunk, applies it, and removes the request line once all hunks resolve', async () => {
    const { client } = makeClient(['summarizer'], [{ hunks: [{ anchor: 'old text', replacement: 'new text' }] }]);
    let latest: EditorState | undefined;
    const setState = vi.fn((s: EditorState) => { latest = s; });
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', setState));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));

    const state = makeState('old text\n> summarizer rewrite');
    await act(async () => { result.current.fireOnLine(state, 1); });
    await waitFor(() => expect(result.current.pending).not.toBeNull());

    act(() => { result.current.acceptHunk(state, 0); });

    expect(latest?.lines).toEqual(['new text']);
    expect(result.current.pending).toBeNull();
  });

  it('declines every hunk and leaves the request line and buffer unchanged', async () => {
    const { client } = makeClient(['summarizer'], [{ hunks: [{ anchor: 'old text', replacement: 'new text' }] }]);
    let latest: EditorState | undefined;
    const setState = vi.fn((s: EditorState) => { latest = s; });
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', setState));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));

    const state = makeState('old text\n> summarizer rewrite');
    await act(async () => { result.current.fireOnLine(state, 1); });
    await waitFor(() => expect(result.current.pending).not.toBeNull());

    act(() => { result.current.declineHunk(state, 0); });

    expect(latest?.lines).toEqual(['old text', '> summarizer rewrite']);
    expect(result.current.pending).toBeNull();
  });

  it('marks a hunk resolved without finalizing the set when more remain', async () => {
    const { client } = makeClient(['summarizer'], [{
      hunks: [{ anchor: 'a', replacement: '1' }, { anchor: 'b', replacement: '2' }],
    }]);
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', vi.fn()));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));

    const state = makeState('a\nb\n> summarizer rewrite');
    await act(async () => { result.current.fireOnLine(state, 2); });
    await waitFor(() => expect(result.current.pending?.hunks.length).toBe(2));

    act(() => { result.current.declineHunk(state, 1); });

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

    const state = makeState('a\nb\n> summarizer rewrite');
    await act(async () => { result.current.fireOnLine(state, 2); });
    await waitFor(() => expect(result.current.pending?.hunks.length).toBe(2));

    act(() => { result.current.acceptHunk(state, 1); });
    expect(result.current.pending?.resolved).toEqual([false, true]);
    expect(result.current.pending).not.toBeNull();

    act(() => { result.current.acceptHunk(latest ?? state, 0); });
    expect(result.current.pending).toBeNull();
    expect(latest?.lines).toEqual(['1', '2']);
  });

  it('is a no-op resolving an already-resolved hunk', async () => {
    const { client } = makeClient(['summarizer'], [{
      hunks: [{ anchor: 'a', replacement: '1' }, { anchor: 'b', replacement: '2' }],
    }]);
    const { result } = renderHook(() => useEditorSuggest(client, '/open/1', vi.fn()));
    await waitFor(() => expect(result.current.personas).toEqual(['summarizer']));

    const state = makeState('a\nb\n> summarizer rewrite');
    await act(async () => { result.current.fireOnLine(state, 2); });
    await waitFor(() => expect(result.current.pending?.hunks.length).toBe(2));

    act(() => { result.current.declineHunk(state, 0); });
    act(() => { result.current.declineHunk(state, 0); });

    expect(result.current.pending?.resolved).toEqual([true, false]);
  });
});
