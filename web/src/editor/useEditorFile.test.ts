import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { EditorView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { fromText, toText } from './model';
import type { EditorApi } from './useEditor';
import { useEditorFile } from './useEditorFile';

function makeView(overrides: Partial<EditorView> = {}): EditorView {
  return { name: 'notes.txt', path: '/home/user/notes.txt', size: '12 B', url: '/open/1', ...overrides };
}

// A stand-in for the real editor API: `load` and `setState` write through to the same ref the hook
// reads, so the loaded document and the dirty comparison behave as they do in a mounted tab.
function makeApi(): EditorApi {
  const stateRef: EditorApi['stateRef'] = { current: null };
  const api = {
    get state() { return stateRef.current; },
    stateRef,
    load: vi.fn((text: string, line?: number) => { stateRef.current = fromText(text, line); }),
    setState: vi.fn((s) => { stateRef.current = s; }),
    insert: vi.fn(),
    apply: vi.fn(),
    sealUndo: vi.fn(),
  } as unknown as EditorApi;
  return api;
}

function makeClient(overrides: Partial<Record<'readFile' | 'saveFile', unknown>> = {}) {
  const readFile = vi.fn().mockResolvedValue('line one\nline two');
  const saveFile = vi.fn().mockResolvedValue(undefined);
  return { readFile, saveFile, ...overrides } as unknown as JanusClient & {
    readFile: ReturnType<typeof vi.fn>;
    saveFile: ReturnType<typeof vi.fn>;
  };
}

describe('useEditorFile — load', () => {
  it('reads the file through the client and loads it into the editor', async () => {
    const client = makeClient();
    const api = makeApi();
    renderHook(() => useEditorFile(client, makeView(), api));

    await waitFor(() => expect(api.load).toHaveBeenCalledWith('line one\nline two', undefined));
    expect(client.readFile).toHaveBeenCalledWith('/open/1');
  });

  it('opens on the requested line, converted from 1-based to 0-based', async () => {
    const client = makeClient();
    const api = makeApi();
    renderHook(() => useEditorFile(client, makeView({ line: 3 }), api));

    await waitFor(() => expect(api.load).toHaveBeenCalledWith('line one\nline two', 2));
  });

  it('surfaces a failed read as a load error naming the file', async () => {
    const client = makeClient({ readFile: vi.fn().mockRejectedValue(new Error('HTTP 404')) });
    const { result } = renderHook(() => useEditorFile(client, makeView(), makeApi()));

    await waitFor(() => expect(result.current.loadError).toBe('Failed to load notes.txt'));
  });

  it('does not read a synced tab that is still provisioning its workspace', async () => {
    const client = makeClient();
    renderHook(() => useEditorFile(client, makeView({ sync: 'provisioning' }), makeApi()));

    await act(async () => { await Promise.resolve(); });
    expect(client.readFile).not.toHaveBeenCalled();
  });

  it('does not re-read a buffer that is already loaded', async () => {
    const client = makeClient();
    const api = makeApi();
    api.stateRef.current = fromText('already here');

    renderHook(() => useEditorFile(client, makeView(), api));

    await act(async () => { await Promise.resolve(); });
    expect(client.readFile).not.toHaveBeenCalled();
  });
});

describe('useEditorFile — save', () => {
  it('writes the buffer through the client and clears the dirty state', async () => {
    const client = makeClient();
    const api = makeApi();
    const { result } = renderHook(() => useEditorFile(client, makeView(), api));
    await waitFor(() => expect(api.load).toHaveBeenCalled());

    api.stateRef.current = fromText('line one\nedited');
    await act(async () => { await result.current.save(); });

    expect(client.saveFile).toHaveBeenCalledWith('/open/1', 'line one\nedited');
    expect(result.current.saveError).toBeNull();
    expect(result.current.savedFlash).toBe(true);
  });

  it('surfaces the server error when a save fails', async () => {
    const client = makeClient({ saveFile: vi.fn().mockResolvedValue('permission denied') });
    const api = makeApi();
    const { result } = renderHook(() => useEditorFile(client, makeView(), api));
    await waitFor(() => expect(api.load).toHaveBeenCalled());

    await act(async () => { await result.current.save(); });

    expect(result.current.saveError).toBe('permission denied');
    expect(result.current.savedFlash).toBe(false);
  });

  it('does nothing when there is no buffer to save yet', async () => {
    const client = makeClient({ readFile: vi.fn(() => new Promise<string>(() => {})) });
    const { result } = renderHook(() => useEditorFile(client, makeView(), makeApi()));

    await act(async () => { await result.current.save(); });

    expect(client.saveFile).not.toHaveBeenCalled();
  });

  it('reports the buffer dirty once it diverges from what was last saved', async () => {
    const client = makeClient();
    const api = makeApi();
    const { result, rerender } = renderHook(() => useEditorFile(client, makeView(), api));
    await waitFor(() => expect(result.current.dirty).toBe(false));

    act(() => { api.setState(fromText('line one\nedited')); });
    rerender();

    expect(toText(api.stateRef.current!)).toBe('line one\nedited');
    expect(result.current.dirty).toBe(true);
  });
});
