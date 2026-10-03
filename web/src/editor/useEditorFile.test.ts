import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { EditorView } from '@shared/protocol';
import { contentHash, SAVE_CONFLICT_ERROR } from '@shared/editor/save-conflict';
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

  it('loads a new file as an empty buffer without reading a path that is not on disk yet', async () => {
    const client = makeClient({ readFile: vi.fn().mockRejectedValue(new Error('HTTP 404')) });
    const api = makeApi();
    const view = makeView({ name: 'untitled.md', size: 'unknown', newFile: true });

    const { result } = renderHook(() => useEditorFile(client, view, api));

    await waitFor(() => expect(api.load).toHaveBeenCalledWith('', undefined));
    expect(client.readFile).not.toHaveBeenCalled();
    expect(result.current.loadError).toBeNull();
    expect(result.current.dirty).toBe(false);
  });

  it('reports a new file dirty once it is typed into', async () => {
    const client = makeClient();
    const api = makeApi();
    const { result, rerender } = renderHook(() => useEditorFile(client, makeView({ newFile: true }), api));
    await waitFor(() => expect(api.load).toHaveBeenCalledWith('', undefined));

    act(() => { api.setState(fromText('first draft')); });
    rerender();

    expect(result.current.dirty).toBe(true);
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

    expect(client.saveFile).toHaveBeenCalledWith('/open/1', 'line one\nedited', contentHash('line one\nline two'));
    expect(result.current.saveError).toBeNull();
    expect(result.current.savedFlash).toBe(true);
  });

  it('makes the next save conditional on the text the previous save wrote', async () => {
    const client = makeClient();
    const api = makeApi();
    const { result } = renderHook(() => useEditorFile(client, makeView(), api));
    await waitFor(() => expect(api.load).toHaveBeenCalled());

    api.stateRef.current = fromText('first save');
    await act(async () => { await result.current.save(); });
    api.stateRef.current = fromText('second save');
    await act(async () => { await result.current.save(); });

    expect(client.saveFile).toHaveBeenLastCalledWith('/open/1', 'second save', contentHash('first save'));
  });

  // The server refuses a buffer built on content no longer on disk — a git-sync pull the watcher
  // never reported. That refusal is the overwrite question, not a failed save: the prompt goes up,
  // no error is shown, and the save rejects so the close guard keeps the tab open.
  it('raises the overwrite prompt when the server refuses a stale buffer, and Overwrite then writes unconditionally', async () => {
    const saveFile = vi.fn().mockResolvedValueOnce(SAVE_CONFLICT_ERROR).mockResolvedValue(undefined);
    const client = makeClient({ saveFile });
    const api = makeApi();
    const { result } = renderHook(() => useEditorFile(client, makeView(), api));
    await waitFor(() => expect(api.load).toHaveBeenCalled());
    act(() => { api.setState(fromText('line one\nedited')); });

    await act(async () => { await expect(result.current.save()).rejects.toThrow(); });

    expect(result.current.conflictOpen).toBe(true);
    expect(result.current.saveError).toBeNull();
    expect(result.current.savedFlash).toBe(false);

    await act(async () => { await expect(result.current.save()).rejects.toThrow(); });
    expect(saveFile).toHaveBeenCalledTimes(1);

    await act(async () => { result.current.overwrite(); await Promise.resolve(); });

    expect(saveFile).toHaveBeenLastCalledWith('/open/1', 'line one\nedited', undefined);
    await waitFor(() => expect(result.current.dirty).toBe(false));
  });

  // The rejection is what the close guard reads: a save that resolved would let it close the tab
  // over the very buffer the server refused to write.
  it('surfaces the server error when a save fails, and rejects rather than reporting success', async () => {
    const client = makeClient({ saveFile: vi.fn().mockResolvedValue('permission denied') });
    const api = makeApi();
    const { result } = renderHook(() => useEditorFile(client, makeView(), api));
    await waitFor(() => expect(api.load).toHaveBeenCalled());

    await act(async () => {
      await expect(result.current.save()).rejects.toThrow('permission denied');
    });

    expect(result.current.saveError).toBe('permission denied');
    expect(result.current.savedFlash).toBe(false);
  });

  it('writes nothing and rejects when there is no buffer to save yet', async () => {
    const client = makeClient({ readFile: vi.fn(() => new Promise<string>(() => {})) });
    const { result } = renderHook(() => useEditorFile(client, makeView(), makeApi()));

    await act(async () => { await expect(result.current.save()).rejects.toThrow(); });

    expect(client.saveFile).not.toHaveBeenCalled();
  });

  // Saving over an external change is a question, not a write: the prompt goes up and nothing
  // reaches disk, so the save has to reject or the close guard would close the tab on the strength
  // of a dialog the user has not answered yet.
  it('raises the overwrite prompt and rejects when an external change is pending', async () => {
    const client = makeClient();
    const api = makeApi();
    const { result, rerender } = renderHook(
      ({ mtimeMs }: { mtimeMs: number }) => useEditorFile(client, makeView({ mtimeMs }), api),
      { initialProps: { mtimeMs: 1000 } },
    );
    await waitFor(() => expect(api.load).toHaveBeenCalled());

    act(() => { api.setState(fromText('line one\nedited')); });
    rerender({ mtimeMs: 2000 });

    await act(async () => { await expect(result.current.save()).rejects.toThrow(); });

    expect(result.current.conflictOpen).toBe(true);
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

describe('useEditorFile overlapping saves', () => {
  async function setupPending() {
    let resolve!: (error: string | undefined) => void;
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the web project's ES2023 library excludes Promise.withResolvers
    const promise = new Promise<string | undefined>((accept) => { resolve = accept; });
    const pending = { promise, resolve };
    const saveFile = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValue(undefined);
    const client = makeClient({ saveFile });
    const api = makeApi();
    const hook = renderHook(
      ({ mtimeMs }: { mtimeMs: number }) => useEditorFile(client, makeView({ mtimeMs }), api),
      { initialProps: { mtimeMs: 1000 } },
    );
    await waitFor(() => expect(api.load).toHaveBeenCalled());
    return { ...hook, client, api, pending, saveFile };
  }

  it('lets repeated actions and a save-before-close caller await one write', async () => {
    const h = await setupPending();
    h.api.stateRef.current = fromText('edited');
    const closed = vi.fn();
    const saveBeforeClose = async () => { await h.result.current.save(); closed(); };
    let requests: Promise<void>[] = [];
    act(() => {
      requests = [h.result.current.save(), h.result.current.save(), saveBeforeClose()];
    });
    expect(h.saveFile).toHaveBeenCalledTimes(1);
    expect(closed).not.toHaveBeenCalled();
    await act(async () => { h.pending.resolve(undefined); await Promise.all(requests); });
    expect(closed).toHaveBeenCalledOnce();
    expect(h.result.current.dirty).toBe(false);
  });

  it('queues changed text with the preceding saved hash and leaves later edits dirty', async () => {
    const h = await setupPending();
    h.api.stateRef.current = fromText('first');
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = h.result.current.save();
      h.api.stateRef.current = fromText('second');
      second = h.result.current.save();
      h.api.stateRef.current = fromText('not yet saved');
    });
    expect(h.saveFile).toHaveBeenCalledTimes(1);
    await act(async () => { h.pending.resolve(undefined); await Promise.all([first, second]); });
    expect(h.saveFile.mock.calls).toEqual([
      ['/open/1', 'first', contentHash('line one\nline two')],
      ['/open/1', 'second', contentHash('first')],
    ]);
    expect(h.result.current.dirty).toBe(true);
  });

  it('rejects queued saves on failure and retries against the unchanged baseline', async () => {
    const h = await setupPending();
    let outcomes!: Promise<PromiseSettledResult<void>[]>;
    act(() => {
      h.api.stateRef.current = fromText('first');
      const first = h.result.current.save();
      h.api.stateRef.current = fromText('second');
      outcomes = Promise.allSettled([first, h.result.current.save()]);
    });
    await act(async () => { h.pending.resolve('disk full'); await outcomes; });
    const settled = await outcomes;
    expect(settled.map((value) => value.status)).toEqual(['rejected', 'rejected']);
    expect(h.saveFile).toHaveBeenCalledTimes(1);
    expect(h.result.current.saveError).toBe('disk full');
    await act(async () => { await h.result.current.save(); });
    expect(h.saveFile).toHaveBeenLastCalledWith('/open/1', 'second', contentHash('line one\nline two'));
    expect(h.result.current.dirty).toBe(false);
  });

  it('rejects queued callers on conflict and recovers through explicit overwrite', async () => {
    const h = await setupPending();
    let outcomes!: Promise<PromiseSettledResult<void>[]>;
    act(() => {
      h.api.stateRef.current = fromText('first');
      const first = h.result.current.save();
      h.api.stateRef.current = fromText('second');
      outcomes = Promise.allSettled([first, h.result.current.save()]);
    });
    await act(async () => { h.pending.resolve(SAVE_CONFLICT_ERROR); await outcomes; });
    const settled = await outcomes;
    expect(settled.every((value) => value.status === 'rejected')).toBe(true);
    expect(h.result.current.conflictOpen).toBe(true);
    expect(h.saveFile).toHaveBeenCalledTimes(1);
    await act(async () => { h.result.current.overwrite(); });
    expect(h.saveFile).toHaveBeenLastCalledWith('/open/1', 'second', undefined);
    expect(h.result.current.dirty).toBe(false);
    h.api.stateRef.current = fromText('third');
    await act(async () => { await h.result.current.save(); });
    expect(h.saveFile).toHaveBeenLastCalledWith('/open/1', 'third', contentHash('second'));
  });

  it('updates the save baseline after a watched reload', async () => {
    const h = await setupPending();
    h.client.readFile.mockResolvedValue('external');
    h.rerender({ mtimeMs: 2000 });
    await waitFor(() => expect(h.api.load).toHaveBeenLastCalledWith('external', 0));
    h.api.stateRef.current = fromText('edited after reload');
    await act(async () => {
      const saving = h.result.current.save();
      h.pending.resolve(undefined);
      await saving;
    });
    expect(h.saveFile).toHaveBeenLastCalledWith('/open/1', 'edited after reload', contentHash('external'));
  });
});
